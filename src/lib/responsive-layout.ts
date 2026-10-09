/**
 * Reguli de așezare care nu depind de un singur tip de ecran.
 *
 * DE CE EXISTĂ
 * ------------
 * Bug-ul din 09.10.2026 (bara de tab-uri acoperită pe telefoanele cu navigare pe 3 butoane)
 * a arătat că layoutul scria dimensiuni fixe în px, valabile doar pentru ecranul pe care a
 * fost probat. De aici ies două reguli, amândouă pure și testabile direct:
 *
 *  1. **jos**: padding-ul de sub conținut = baza istorică + `insets.bottom` citit din zona
 *     sigură, ca ultimul element să nu intre sub bara de navigare a sistemului;
 *  2. **lat**: de la `WIDE_SCREEN_MIN_WIDTH` (foldable deschis / tabletă) conținutul se
 *     limitează la `CONTENT_MAX_WIDTH` și se centrează, altfel rămâne întins pe tot ecranul.
 *
 * Calculele stau aici, nu în componente, ca testul să poată hrăni funcțiile cu lățimi și
 * inseturi pe care emulatorul nu le are (`tests/responsive-layout.test.mjs`).
 */

/** De la această lățime (dp) ecranul e considerat lat: foldable deschis sau tabletă. */
export const WIDE_SCREEN_MIN_WIDTH = 600;

/** Lățimea maximă a conținutului pe ecrane late (aceeași limită ca în `privacy`/`terms`). */
export const CONTENT_MAX_WIDTH = 760;

/** Padding-ul de jos de bază al conținutului, fără zona sigură (valoarea istorică). */
export const SCREEN_BOTTOM_BASE_PADDING = 36;

/** Stilul de container pentru conținut: gol pe telefon, centrat și limitat pe ecran lat. */
export type ContentBoxStyle = { width?: '100%'; maxWidth?: number; alignSelf?: 'center' };

/**
 * Ecran lat? Numai numere finite și pozitive: o citire lipsă sau ciudată a lățimii nu are
 * voie să declanșeze centrarea (ar muta layoutul pe telefon).
 */
export function isWideScreen(widthDp: number): boolean {
  return Number.isFinite(widthDp) && widthDp >= WIDE_SCREEN_MIN_WIDTH;
}

/** Containerul de conținut: fără limită pe telefon, centrat cu lățime maximă pe ecran lat. */
export function contentBoxStyle(widthDp: number): ContentBoxStyle {
  if (!isWideScreen(widthDp)) return {};
  return { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' };
}

/**
 * Padding-ul de jos al conținutului: baza + zona sigură raportată de sistem.
 * O citire lipsă/negativă/nefinită se tratează ca 0, deci baza nu scade niciodată.
 */
export function screenBottomPadding(insetsBottom: number, base: number = SCREEN_BOTTOM_BASE_PADDING): number {
  const inset = Number.isFinite(insetsBottom) && insetsBottom > 0 ? insetsBottom : 0;
  return base + inset;
}
