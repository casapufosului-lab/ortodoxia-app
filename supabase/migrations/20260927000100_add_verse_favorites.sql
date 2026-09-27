-- ============================================================================
--  Favorite pe versete biblice
-- ============================================================================
--
--  DE CE UN TABEL NOU, NU O COLOANĂ ÎN `favorites`
--  Tabelul `favorites` are cheia primară (user_id, prayer_id), cu prayer_id obligatoriu. Ca să
--  încapă și versetele acolo ar trebui rescrise cheia primară și constrângerea, adică exact
--  operația care poate pierde favoritele oamenilor la o migrație. Un tabel alături, cu aceleași
--  reguli, face același lucru fără să atingă ce există deja.
--
--  Un verset e identificat prin patru lucruri (traducere, carte, capitol, verset) — exact cheia
--  primară a lui `bible_verses` — iar cheia străină compusă garantează că nu se poate salva un
--  favorit pentru un verset care nu există.
--
--  Psalmi: corpusul de acum are 27 de cărți, toate din Noul Testament (vezi
--  `20260923000300_seed_bible_verses_corpus.sql`), deci Psalmii nu pot fi favoriți încă. Când
--  corpusul va primi Psalmii, favoritul funcționează fără nicio schimbare aici: versetele intră
--  în același tabel.
-- ============================================================================

create table if not exists public.verse_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  translation_id text not null,
  book_code text not null,
  chapter integer not null check (chapter > 0),
  verse integer not null check (verse > 0),
  created_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, translation_id, book_code, chapter, verse),
  foreign key (translation_id, book_code, chapter, verse)
    references public.bible_verses (translation_id, book_code, chapter, verse)
    on delete cascade
);

-- listarea favoritelor unui om e interogarea de bază a ecranului
create index if not exists verse_favorites_user_idx
  on public.verse_favorites (user_id, created_at desc);

alter table public.verse_favorites enable row level security;

-- Aceleași reguli ca la `favorites`: fiecare om își vede și își schimbă doar favoritele lui.
create policy "verse_favorites_select_own"
  on public.verse_favorites for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "verse_favorites_insert_own"
  on public.verse_favorites for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "verse_favorites_delete_own"
  on public.verse_favorites for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- Ștergerea contului: rândurile pleacă odată cu utilizatorul (`on delete cascade` mai sus), la fel
-- ca la celelalte tabele ale aplicației, deci funcția de ștergere a contului nu are nevoie de nimic
-- în plus. Verificat în `supabase/functions/delete-account/index.ts` la revederea acestei migrații.
