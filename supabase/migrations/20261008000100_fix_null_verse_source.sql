-- 20261008000100 — `verse_source` conținea textul literal „NULL" în 2 158 de rânduri.
--
-- DE CE EXISTĂ
-- ------------
-- Auditul de dinainte de lansare a găsit, în `public.daily_content`, rânduri în care coloana
-- `verse_source` (referința biblică afișată sub verset) conține șirul literal „NULL", moștenit
-- din exportul de conținut. Valoarea ajungea pe ecran și în textul notificărilor zilnice.
--
-- REPARAȚIA ARE DOUĂ PĂRȚI
-- -----------------------
-- 1. Aplicația nu mai afișează nicio valoare necitibilă: `src/lib/content-source.ts` ascunde
--    „NULL" și id-urile interne de material (ex. `ro_versete_0057`, prins de audit într-o captură
--    de magazin), iar `tests/content-source-display.test.mjs` apără regula. Ecranul este deci
--    corect chiar înainte de rularea acestei migrații.
-- 2. Migrația curăță datele la sursă, ca „NULL" să nu mai existe deloc în tabel.
--
-- CE NU FACE
-- ----------
-- Nu inventează nicio referință biblică. Câmpul se golește, iar aplicația omite linia de sursă;
-- o referință reală se completează ulterior, pe rând, din sursa editorială (regulile proiectului
-- interzic fabricarea de conținut).
--
-- DE CE ESTE SIGUR
-- ----------------
-- * `verse_source` este `text not null` (`20260829000100_initial_schema.sql`), deci valoarea
--   folosită este șirul gol, nu NULL.
-- * Cheia naturală (`country_code`, `language_code`, `content_date`) nu se atinge; nu se
--   inserează și nu se șterge niciun rând, deci un rând editat ulterior de operator își păstrează
--   identitatea.
-- * Comparația este `upper(trim(...))`, deci prinde și `null`, ` NULL ` sau `Null`.
-- * Reluarea migrației nu schimbă nimic: după primul UPDATE nu mai există rânduri potrivite.

begin;

update public.daily_content
   set verse_source = ''
 where upper(trim(verse_source)) = 'NULL';

commit;

-- Verificare (trebuie să întoarcă 0):
--   select count(*) from public.daily_content where upper(trim(verse_source)) = 'NULL';
