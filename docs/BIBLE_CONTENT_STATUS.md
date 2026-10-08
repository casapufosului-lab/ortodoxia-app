# Bible Content Status - Verification Document

This document records the verified source, local provenance, and structural integrity of the New Testament content currently served by the Ortodoxia APP.

The content was audited READ-ONLY against the live Supabase table `public.bible_verses` and verified against the local repository. No Bible verse text was modified during the audit. Live Supabase was not modified.

---

## SOURCE

| Field | Value |
|-------|-------|
| Translation ID | `ronbl` |
| Translation name | Biblia Liberă |
| Language | Română |
| Scope | Noul Testament |
| Official eBible source | https://ebible.org/ronbl/ |
| Official copyright/status page | https://ebible.org/ronbl/copyright.htm |
| Official eBible copyright registry | https://ebible.org/Scriptures/copyright.php |

The translation name, ID, language, scope, and upstream URLs are defined in the local constant `BIBLE_SOURCE` at:

- `src/data/bible-source.ts` (lines 1-9)

The Bible UI imports this constant at:

- `src/app/(tabs)/bible.tsx` line 6: `import { BIBLE_SOURCE } from '@/data/bible-source';`

---

## LEGAL STATUS

The official eBible source explicitly identifies Biblia Liberă / `ronbl` as:

**Public Domain**

The application MUST NOT replace this with an inferred license name (for example, no Creative Commons, MIT, or other license is to be claimed).

The application MUST NOT claim this translation is the Romanian Orthodox Synodal Bible.

The translation is described upstream as a draft under revision. The local UI text already states: "Noul Testament, traducere în curs de revizuire și disponibilă în domeniul public. Nu este prezentată drept ediția sinodală ortodoxă." (see `src/app/(tabs)/bible.tsx` line 123).

---

## LOCAL APP ATTRIBUTION

Where the source constant is defined:

- File: `src/data/bible-source.ts`
- Lines 1-9: `BIBLE_SOURCE` object with `id`, `name`, `language`, `scope`, `status`, `sourceUrl`, `copyrightUrl`.

What the current UI shows to end users (evidence in `src/app/(tabs)/bible.tsx`):

- Line 114: `eyebrow={`${BIBLE_SOURCE.name} · ${BIBLE_SOURCE.scope}`}` — renders "Biblia Liberă · Noul Testament" as page eyebrow.
- Line 121: `<Text style={styles.sourceTitle}>{BIBLE_SOURCE.name}</Text>` — renders "Biblia Liberă" as the source title in the source card.
- Line 123: renders the public-domain and non-synodal disclaimer.
- Line 125: clickable link to `BIBLE_SOURCE.copyrightUrl` — labeled "Vezi sursa și condițiile de folosire".
- Line 213: clickable button to `BIBLE_SOURCE.sourceUrl` — labeled "Deschide sursa originală".

Both `sourceUrl` and `copyrightUrl` are exposed in the UI.

---

## STRUCTURAL CONTENT

A READ-ONLY audit of the live Supabase table `public.bible_verses` with `translation_id = 'ronbl'` and `is_published = true` produced:

| Metric | Value |
|--------|-------|
| Published verses | 7958 |
| Books with content | 27 |
| Duplicate verse keys | 0 |

The local repository configures exactly 27 New Testament books (codes MAT, MAR, LUK, JOH, ACT, ROM, 1CO, 2CO, GAL, EPH, PHI, COL, 1TH, 2TH, 1TI, 2TI, TIT, PHM, HEB, JAM, 1PE, 2PE, 1JO, 2JO, 3JO, JUD, REV) in the `books` array at `src/app/(tabs)/bible.tsx` lines 9-37.

The database table `public.bible_verses` is defined by migration `supabase/migrations/20260831000800_create_bible_verses.sql` (lines 1-11) with primary key `(translation_id, book_code, chapter, verse)` and a `verse_text text not null` column, plus a published-only RLS policy for `anon, authenticated`.

---

## INTENTIONAL EMPTY VERSE MARKERS

Exactly five published rows have empty `verse_text` in the live Supabase table for `translation_id = 'ronbl'`, `is_published = true`:

| Book | Chapter | Verse |
|------|---------|-------|
| LUK  | 17      | 36    |
| ACT  | 8       | 37    |
| ACT  | 15      | 34    |
| ACT  | 24      | 7     |
| ROM  | 16      | 25    |

These positions correspond to preserved verse-number placeholders / textual-variant omissions in the source tradition.

These rows preserve verse numbering for textual variants/omissions and MUST NOT be populated by guessing or copying from another translation.

Any additional empty verse outside these exact five must be considered an integrity failure.

---

## AUDIT POSTURE

- Bible wording was NOT modified during CONTENT-A2.
- Live Supabase was READ-ONLY during the audit.
- ~~No local Bible data file (JSON/CSV) exists in the repository.~~ **Corectat 08.10.2026 (poziția C15):**
  există **un** fișier JSON local — `assets/bible/bible-verses.json`, 2 943 383 B (2,81 MB), 79 587 de linii,
  obiect cu cheile `exportedAt`, `total`, `verses`, exportat la `2026-09-22T22:48:52.384Z` (cu o zi înainte de
  corpusul SQL). **Nu este referit de nimic** din `src/`, `scripts/` sau `supabase/`; `app.json` nu declară
  `assetBundlePatterns`, iar Metro împachetează doar fișierele importate, deci JSON-ul **nu ajunge în
  aplicație** și nu are efect la rulare. Sursa de adevăr rămasă (și testată) este corpusul SQL de mai jos;
  fișierul orfan e candidat de șters — **decizie a ownerului**, nu s-a șters nimic.
- ~~The only repository files referencing Bible content are `src/data/bible-source.ts`, `src/app/(tabs)/bible.tsx`,
  and `supabase/migrations/20260831000800_create_bible_verses.sql`.~~ **Corectat 08.10.2026:** lista era
  incompletă — mai există `src/lib/verse-favorites.ts` (citește `verse_favorites`), iar conținutul biblic e
  seedat și de `supabase/migrations/20260923000300_seed_bible_verses_corpus.sql` (1,28 MB), nu doar de
  migrația care creează tabela.

---

## CORPUS EXPORTAT (23.09.2026) — versetele nu mai depind de baza remote

Până acum, versetele existau **doar** în baza remote (rândul de mai sus era adevărul). Din 23.09.2026
există un export complet, generat din baza reală și versionat în depozit:

| Fișier | Ce conține | Rânduri |
|---|---|---|
| `supabase/migrations/20260923000300_seed_bible_verses_corpus.sql` | corpusul biblic (PK: traducere, carte, capitol, verset) | **7 958** |
| `supabase/migrations/20260923000400_seed_prayers_with_audio.sql` | rugăciunile, cu `audio_path` | 10 |
| `supabase/migrations/20260923000500_seed_calendar_days_corpus.sql` | calendarul, cu codurile de calendar | 5 110 |

Pipeline-ul (export → seed → verificare, cu amprentă sha256 a rândurilor) este documentat în
`docs/BIBLE_CORPUS_PIPELINE.md`. Seed-urile sunt **idempotente** (`on conflict do nothing`), deci pe baza
de producție nu modifică niciun rând, iar pe o bază goală o reconstruiesc exact: dovedit cu
`node tests/database/content-seeds.mjs <pglite>` (19 aserțiuni pe un PostgreSQL real, inclusiv
idempotența și numărul exact de rânduri). Marcajele de verset gol din tabelul de mai sus rămân
neatinse: exportul copiază textul exact, nu îl completează.

