/**
 * Legal/support identity values, read from the environment.
 *
 * Kept free of any i18n import so the substitution logic can be unit-tested in
 * plain Node. The translated wrapper lives in `src/lib/legal-fields.ts`.
 *
 * NOTHING HERE IS INVENTED. An absent value stays null and the UI renders an
 * explicit "not configured" notice; the release gate fails until it is supplied.
 */

export type SupportContactValues = {
  /** Operator / legal entity name. */
  legalEntity: string | null;
  /** Support e-mail address. */
  supportEmail: string | null;
  /** Postal address of the operator. */
  postalAddress: string | null;
  /** Governing jurisdiction. */
  jurisdiction: string | null;
  /** Locality of the competent courts. */
  locality: string | null;
  /** Public URL of the privacy policy. */
  privacyPolicyUrl: string | null;
  /** Public URL of the terms. */
  termsUrl: string | null;
  /** Effective date shown in the legal documents' header. */
  effectiveDate: string | null;
};

function readEnv(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  // Treat the documented placeholder forms as "not configured".
  if (/^(your_|REPLACE|CHANGEME|TODO|\[)/i.test(trimmed)) return null;
  return trimmed;
}

/**
 * Pragmatic shape check for the support address.
 *
 * The address is interpolated into a `mailto:` URL, so a value containing whitespace,
 * a control character, a comma/semicolon (which would silently add recipients) or a
 * second `@` produces a link that either does nothing or does something the operator
 * did not intend. An address that fails this check is treated as **not configured**:
 * the release gate then reports the variable as missing and the UI shows its explicit
 * "not configured" notice, which is strictly better than shipping a dead link.
 */
export function isPlausibleEmail(value: string | null): value is string {
  if (!value) return false;
  if (/[\s,;<>()"\\]/.test(value)) return false;
  return /^[^@]+@[^@.]+(\.[^@.]+)+$/.test(value);
}

function readEmail(value: string | undefined): string | null {
  const trimmed = readEnv(value);
  return isPlausibleEmail(trimmed) ? trimmed : null;
}

/**
 * Only absolute http(s) URLs are accepted, so a misconfigured value cannot turn
 * into a `javascript:` or custom-scheme navigation.
 */
export function safeExternalUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/** Placeholder names that may appear inside the translated legal strings. */
export type LegalPlaceholder =
  | 'legalEntity'
  | 'supportAddress'
  | 'postalAddress'
  | 'jurisdiction'
  | 'locality'
  | 'privacyPolicyUrl'
  | 'termsUrl'
  | 'effectiveDate';

/**
 * Placeholder name used inside the translated legal strings -> the value field that
 * fills it.
 *
 * These are not the same names: the strings say `{supportAddress}` because that is
 * the user-facing concept, while the field is `supportEmail` because that is what it
 * actually holds. Keeping the mapping explicit means a rename on either side is a
 * one-line change instead of a silent blank in the legal text.
 */
export const LEGAL_PLACEHOLDER_FIELDS: Record<LegalPlaceholder, keyof SupportContactValues> = {
  legalEntity: 'legalEntity',
  supportAddress: 'supportEmail',
  postalAddress: 'postalAddress',
  jurisdiction: 'jurisdiction',
  locality: 'locality',
  privacyPolicyUrl: 'privacyPolicyUrl',
  termsUrl: 'termsUrl',
  effectiveDate: 'effectiveDate',
};

/**
 * The environment variable backing each value field. Also used by the release gate
 * and by the mailto helper, so the name list has a single definition.
 */
export const LEGAL_FIELD_ENV_VARS = {
  legalEntity: 'EXPO_PUBLIC_LEGAL_ENTITY',
  supportEmail: 'EXPO_PUBLIC_SUPPORT_EMAIL',
  postalAddress: 'EXPO_PUBLIC_LEGAL_POSTAL_ADDRESS',
  jurisdiction: 'EXPO_PUBLIC_LEGAL_JURISDICTION',
  locality: 'EXPO_PUBLIC_LEGAL_LOCALITY',
  privacyPolicyUrl: 'EXPO_PUBLIC_PRIVACY_POLICY_URL',
  termsUrl: 'EXPO_PUBLIC_TERMS_URL',
  effectiveDate: 'EXPO_PUBLIC_LEGAL_EFFECTIVE_DATE',
};

export const LEGAL_VALUES: SupportContactValues = {
  legalEntity: readEnv(process.env.EXPO_PUBLIC_LEGAL_ENTITY),
  supportEmail: readEmail(process.env.EXPO_PUBLIC_SUPPORT_EMAIL),
  postalAddress: readEnv(process.env.EXPO_PUBLIC_LEGAL_POSTAL_ADDRESS),
  jurisdiction: readEnv(process.env.EXPO_PUBLIC_LEGAL_JURISDICTION),
  locality: readEnv(process.env.EXPO_PUBLIC_LEGAL_LOCALITY),
  privacyPolicyUrl: safeExternalUrl(readEnv(process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL)),
  termsUrl: safeExternalUrl(readEnv(process.env.EXPO_PUBLIC_TERMS_URL)),
  effectiveDate: readEnv(process.env.EXPO_PUBLIC_LEGAL_EFFECTIVE_DATE),
};

/** `mailto:` URL for the support address, or null when it is not configured. */
export function supportMailtoUrl(values: SupportContactValues = LEGAL_VALUES): string | null {
  // Guarded here as well as at read time: this is the single place a `mailto:` is
  // built, so an invalid address can never reach a tappable link even if it was
  // injected into the value object by something other than the environment.
  if (!isPlausibleEmail(values.supportEmail)) return null;
  return `mailto:${values.supportEmail}`;
}

/** Machine-readable completeness report consumed by the release gate. */
export function missingLegalFields(values: SupportContactValues = LEGAL_VALUES): string[] {
  const fields = Object.keys(LEGAL_FIELD_ENV_VARS) as (keyof SupportContactValues)[];
  return fields
    .filter((field) => !values[field])
    .map((field) => LEGAL_FIELD_ENV_VARS[field]);
}

export function isLegalIdentityConfigured(values: SupportContactValues = LEGAL_VALUES): boolean {
  return missingLegalFields(values).length === 0;
}

/**
 * Substitute `{placeholder}` tokens in a legal string with the configured values.
 *
 * Any token whose value is missing is replaced with `missingLabel` (a localized
 * "to be completed" notice) rather than left as a raw `{token}`, so the document
 * never shows an interpolation artefact to a user. An unknown token is left as-is
 * so a typo stays visible in review instead of silently blanking the sentence.
 */
export function fillLegalPlaceholders(
  text: string,
  missingLabel: string,
  values: SupportContactValues = LEGAL_VALUES,
): string {
  return text.replace(/\{([a-zA-Z_]+)\}/g, (match, placeholder: string) => {
    const field = LEGAL_PLACEHOLDER_FIELDS[placeholder as LegalPlaceholder];
    if (!field) return match;
    return values[field] ?? missingLabel;
  });
}
