/**
 * Sursa care se poate afișa sub un text de conținut (versetul zilei, pilda, rugăciunea).
 *
 * DE CE EXISTĂ
 * ------------
 * Două câmpuri din baza de date ajung, astăzi, direct pe ecran:
 *   - `verse_source` — referința biblică (ex. „Coloseni 3:15");
 *   - `editorial_source` — sursa editorială a materialului.
 * Ambele pot conține valori care nu au ce căuta în fața omului:
 *   1. textul literal „NULL", rămas din exportul de conținut (2 158 de rânduri în
 *      `daily_content`, măsurate de audit);
 *   2. un id intern de material (ex. `ro_versete_0057`), care nu spune nimic unui cititor —
 *      auditul l-a prins pozat într-o captură de magazin.
 *
 * Regula aplicată aici: ce nu se poate citi de un om nu se afișează deloc. Mai bine fără
 * linie de sursă decât cu „NULL" sau cu un cod intern pe ecran.
 */

/** Valori care înseamnă „nu există sursă", indiferent de felul în care au ajuns în bază. */
const PLACEHOLDER_VALUES = new Set(['null', 'undefined', 'n/a', 'na', 'none', 'nil', '-', '—', '–']);

/**
 * Id intern de material din pipeline-ul de conținut: două litere de limbă/țară, una sau mai
 * multe bucăți de cuvinte și un număr (ex. `ro_versete_0057`, `ro_rugaciuni_012`).
 */
const INTERNAL_ID = /^[a-z]{2}(_[a-z0-9]+)+_\d+$/;

/** `true` doar pentru id-urile interne de material (nu pentru o sursă editorială reală). */
export function isInternalContentId(value: string | null | undefined): boolean {
  if (typeof value !== 'string') return false;
  return INTERNAL_ID.test(value.trim());
}

/** `true` pentru gol, spații, „NULL", „n/a" și rudele lor. */
export function isPlaceholderContentValue(value: string | null | undefined): boolean {
  if (value == null) return true;
  const trimmed = value.trim();
  return trimmed === '' || PLACEHOLDER_VALUES.has(trimmed.toLowerCase());
}

/** Textul care poate fi arătat omului, sau `null` când nu există nimic de arătat. */
export function displayableSource(value: string | null | undefined): string | null {
  if (isPlaceholderContentValue(value)) return null;
  const trimmed = (value as string).trim();
  if (isInternalContentId(trimmed)) return null;
  return trimmed;
}

/**
 * Linia de sursă pentru versetul/pilda zilei: referința biblică are prioritate, iar sursa
 * editorială se folosește doar dacă e, la rândul ei, citibilă.
 */
export function verseSourceLabel(
  verseSource: string | null | undefined,
  editorialSource: string | null | undefined,
): string | null {
  return displayableSource(verseSource) ?? displayableSource(editorialSource);
}

/**
 * Scoate grupurile goale de paranteze și normalizează spațiile.
 *
 * DE CE: șabloanele de notificare din baza de date au forma
 * `{verse_text} ({verse_source}) Începe ziua cu pace.` Când versetul nu are referință
 * (`verse_source` era literal „NULL", acum se golește — vezi migrația
 * `20261008000100_fix_null_verse_source.sql`), substituția simplă lăsa în text un „()" gol.
 */
export function stripEmptyParentheses(text: string): string {
  return text.replace(/\(\s*\)/g, '').replace(/\s+/g, ' ').trim();
}
