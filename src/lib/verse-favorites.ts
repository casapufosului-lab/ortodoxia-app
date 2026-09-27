/**
 * Cheia unui verset favorit, ținută într-un singur loc.
 *
 * Un verset e identificat prin patru lucruri (traducere, carte, capitol, verset) — exact cheia
 * primară a tabelului `bible_verses` și a tabelului de favorite. Dacă cele două locuri ar compune
 * cheia altfel (de pildă cu alt separator ori cu capitolul ca text), favoritele s-ar salva, dar
 * nu s-ar mai regăsi la citire. De aceea compunerea și comutarea stau aici, pure, și sunt testate.
 *
 * Rulează cu: npm test
 */

export type VerseRef = {
  readonly translationId: string;
  readonly bookCode: string;
  readonly chapter: number;
  readonly verse: number;
};

/** Un rând citit din tabelul de favorite; poate veni stricat, de aceea se validează. */
export type FavoriteRow = {
  readonly translation_id?: unknown;
  readonly book_code?: unknown;
  readonly chapter?: unknown;
  readonly verse?: unknown;
};

/** Separatorul nu are voie să apară în codurile de carte ori de traducere. */
export function verseKey(ref: VerseRef): string {
  return [ref.translationId, ref.bookCode, ref.chapter, ref.verse].join('|');
}

/** Versetul e deja la favorite? */
export function isFavoriteKey(keys: readonly string[], key: string): boolean {
  return keys.includes(key);
}

/** Pune sau scoate versetul din favorite (inima plină / goală). */
export function toggleFavoriteKey(keys: readonly string[], key: string): string[] {
  return keys.includes(key) ? keys.filter((element) => element !== key) : [...keys, key];
}

/**
 * Cheile citite din tabelul de favorite.
 *
 * Se citește defensiv: un rând fără toate cele patru câmpuri se aruncă, nu strică lista întreagă —
 * la fel ca la coșul din Mobilitate, unde un produs scos din catalog nu blochează restul.
 */
export function keysFromRows(rows: readonly FavoriteRow[]): string[] {
  const chei: string[] = [];
  for (const row of rows) {
    // Un rând care nu e obiect (null, text, număr) se aruncă înainte de orice citire de câmp.
    if (typeof row !== 'object' || row === null) continue;
    const { translation_id, book_code, chapter, verse } = row;
    if (typeof translation_id !== 'string' || translation_id.length === 0) continue;
    if (typeof book_code !== 'string' || book_code.length === 0) continue;
    if (typeof chapter !== 'number' || !Number.isInteger(chapter) || chapter < 1) continue;
    if (typeof verse !== 'number' || !Number.isInteger(verse) || verse < 1) continue;
    const cheie = verseKey({ translationId: translation_id, bookCode: book_code, chapter, verse });
    if (!chei.includes(cheie)) chei.push(cheie);
  }
  return chei;
}
