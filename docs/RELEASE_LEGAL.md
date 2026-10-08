# Legal release documentation

Status of the legal/support identity the app ships (operator, support contact, mailing address,
jurisdiction, effective date, policy URLs).

**Rewritten 08.10.2026.** The version of this file written on 03.09.2026 listed bracketed
`[DE COMPLETAT]` placeholders in `src/app/privacy.tsx` and `src/app/terms.tsx`. That list no longer
describes the app: measured today, `DE COMPLETAT` occurs in **0** files under `src/`, and both
screens carry **0** bracketed tokens.

## How the values work now

The values are **not literals in the screens**. They come from environment variables, are read by
`src/lib/legal-values.ts` (`LEGAL_VALUES`, `fillLegalPlaceholders`, `isLegalIdentityConfigured`,
`missingLegalFields`, `supportMailtoUrl`) and are substituted into the translated strings through
`useLegalFill()` (`src/lib/legal-fields.ts:21`) and `useLegalIdentity()` (`src/lib/legal-fields.ts:26`).

| Value | Environment variable |
|---|---|
| Operator / legal entity | `EXPO_PUBLIC_LEGAL_ENTITY` |
| Support e-mail | `EXPO_PUBLIC_SUPPORT_EMAIL` |
| Postal address | `EXPO_PUBLIC_LEGAL_POSTAL_ADDRESS` |
| Jurisdiction | `EXPO_PUBLIC_LEGAL_JURISDICTION` |
| Locality | `EXPO_PUBLIC_LEGAL_LOCALITY` |
| Effective date | `EXPO_PUBLIC_LEGAL_EFFECTIVE_DATE` |
| Privacy policy URL | `EXPO_PUBLIC_PRIVACY_POLICY_URL` |
| Terms URL | `EXPO_PUBLIC_TERMS_URL` |

All eight are declared in **every** EAS build profile (checked 08.10.2026: `development` 11 env keys,
`preview` and `production` 12 — the extra one is the RevenueCat public key).

## What happens when a value is missing

Nothing is invented and nothing is left blank:

- `readEnv()` in `src/lib/legal-values.ts:30` treats an empty value and the documented placeholder
  forms (`your_…`, `REPLACE`, `CHANGEME`, `TODO`, a leading `[`) as **not configured**;
- `isPlausibleEmail()` (`:48`) rejects an address that would produce a broken `mailto:` link, and
  `safeExternalUrl()` (`:63`) accepts only absolute `http(s)` URLs;
- where a value is missing, `fillLegalPlaceholders()` writes the localized
  `t('legal.toBeCompleted')` notice in its place (`src/lib/legal-fields.ts:23`), so the gap is
  **visible on screen** instead of shipped silently;
- the release gate fails until the value is supplied: `[legal] legal identity and support contact
  are fully configured` and `[legal] an actionable support contact is configured and wired`.

## Where the old bracketed tokens went

They were replaced by interpolation placeholders (`{operator}`, `{date}`, `{supportAddress}`, …) by
`scripts/normalize-legal-placeholders.mjs`. The script is idempotent and runs as part of
`npm run test:i18n`, so a re-introduced token is caught by the suite.

Measured 08.10.2026 (release gate, RELEASE mode): **PASS** `[legal] legal strings carry interpolation
placeholders, not bracketed tokens`, **PASS** `[legal] every legal placeholder is present in the
corpus`, **PASS** `[legal] legal identity and support contact are fully configured`, **PASS**
`[legal] an actionable support contact is configured and wired`.

## What the owner still has to do

**Nothing in this file.** The values live in the EAS build profiles; if the operator, the address or
a URL changes, change the EAS environment variable and rebuild.

Legal wording itself is a separate question and is tracked in `docs/LICENTE-CONTINUT.md` (content
rights) plus the store forms listed in `docs/OWNER-ACTIONS.md`.
