import { type TranslationKey } from '@/i18n/config';
import {
  fillLegalPlaceholders,
  LEGAL_VALUES,
  isLegalIdentityConfigured,
  missingLegalFields,
  supportMailtoUrl,
} from '@/lib/legal-values';
import { useLocalization } from '@/providers/localization-provider';

/**
 * Screen-facing helpers for the legal/support identity.
 *
 * `src/lib/legal-values.ts` holds the raw environment values and the substitution
 * logic with no i18n import, so both stay unit-testable in plain Node. This module
 * is the thin translated wrapper the screens use: it supplies the localized
 * "to be completed" notice for any value that has not been configured yet.
 */

/** Fill the `{placeholders}` of one legal string in the active language. */
export function useLegalFill() {
  const { t } = useLocalization();
  return (text: string) => fillLegalPlaceholders(text, t('legal.toBeCompleted'));
}

export function useLegalIdentity() {
  const { t } = useLocalization();
  return {
    values: LEGAL_VALUES,
    isConfigured: isLegalIdentityConfigured(),
    missing: missingLegalFields(),
    mailto: supportMailtoUrl(),
    /** Localized notice shown wherever a value is still missing. */
    missingLabel: t('legal.toBeCompleted'),
  };
}

/** Re-exported so the account screen can build a mailto link without a second hook. */
export { supportMailtoUrl, type TranslationKey };
