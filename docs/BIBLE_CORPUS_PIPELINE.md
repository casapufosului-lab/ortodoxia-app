# Pipeline-ul corpusului biblic (export → seed → verificare)

## De ce există

`docs/BIBLE_CONTENT_STATUS.md` spunea adevărul incomod: cele **7 958 de versete** (traducerea `ronbl`),
**10 rugăciuni** (toate cu `audio_path`) și **5 110 zile de calendar** trăiau DOAR în baza remote. Dacă
proiectul Supabase se pierdea, se pierdea și munca editorială, iar baza nu putea fi reconstruită din
depozit. Poarta de release marca asta ca `DEFERRED … BLOCKED_MISSING_SOURCE_DATA`.

Acum există un drum complet, în ambele sensuri:

```
baza reală  --(npm run content:export)-->  migrații de seed  --(npx supabase db push)-->  baza reală
                        ^                                                            |
                        |____________ npm run content:export:check ___________________|
                                     (compară ce e pe disc cu ce e în bază)
```

## Comenzi

```powershell
# export (citește baza; NU scrie în bază, NU inventează conținut)
$env:SUPABASE_URL="https://<ref>.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="<cheia de service>"    # din mediu, niciodată în depozit
npm run content:export                # toate cele trei corpusuri
npm run content:export -- --only bible
npm run content:export:check          # compară amprentele de pe disc cu baza reală (nu scrie)

# aplicare (idempotentă: pe o bază populată nu schimbă niciun rând)
npx supabase db push --linked --yes

# verificare pe un PostgreSQL real, în memorie (fără Supabase)
node tests/database/content-seeds.mjs <cale către @electric-sql/pglite/dist/index.js>
```

## Fișierele generate

| Migrație | Tabel | Rânduri | Rol |
|---|---|---|---|
| `20260923000300_seed_bible_verses_corpus.sql` | `bible_verses` | 7 958 | corpusul biblic (PK: traducere, carte, capitol, verset) |
| `20260923000400_seed_prayers_with_audio.sql` | `prayers` | 10 | rugăciunile, **cu `audio_path`** (`ro/<slug>.mp3`, fișierele sunt în bucket-ul privat `prayer-audio`) |
| `20260923000500_seed_calendar_days_corpus.sql` | `calendar_days` | 5 110 | calendarul, cu `calendar_code`, `feast_rank(_code)`, `country_code`, `language_code` |

Fiecare fișier are în antet: data generării, sursa exactă, numărul de rânduri și **amprenta sha256 a
rândurilor** (în ordinea stabilă din `order by`). O re-exportare care schimbă ceva produce altă amprentă,
deci diferența se vede — `npm run content:export:check` iese cu eroare dacă discul și baza nu mai coincid.

## Ce garantează seed-urile

1. **Idempotent:** `insert … on conflict do nothing;` (fără țintă, deci acoperă orice constrângere).
   Pe baza de producție, rularea nu modifică niciun rând; pe o bază goală, inserează exact ce s-a exportat.
2. **Determinist:** ordinea este dată de cheile primare/câmpuri stabile, iar valorile sunt scrise cu
   escaping SQL corect (apostrof dublat, `text[]` pentru `saints`).
3. **Fără conținut inventat:** fiecare valoare vine din baza reală, la data din antet. Exportul nu
   completează, nu normalizează și nu „îmbunătățește" textul.
4. **Fără efecte secundare:** scriptul doar citește baza (PostgREST, cheia de service din mediu) și scrie
   fișiere în `supabase/migrations/`. Nu atinge `created_at`/`updated_at` (rămân valorile implicite).

## Ce NU rezolvă

- **Fișierele audio** (MP3) nu intră în Git: rămân în bucket-ul privat `prayer-audio`. Migrația seedază
  `audio_path`, deci baza știe unde sunt; cine le citește trebuie să folosească un URL semnat.
- **`saints` este gol în toate cele 5 110 de rânduri** din producție (măsurat: `saints=not.eq.{}` → 0).
  Seed-ul scrie exact atât: `'{}'::text[]`. Dacă se dorește popularea, e muncă editorială, nu export.
- **Calendarul 2027** nu există încă în bază (calendarele bisericești pe 2027 nu sunt publicate), deci nu
  poate fi exportat. Când apar, `npm run content:export` le ia automat.

## Verificarea (dovada, nu promisiunea)

- `tests/bible-corpus-export.test.mjs` — funcțiile pure: escaping (apostrof, linie nouă, diacritice, NUL
  refuzat), `text[]`, determinism, idempotent (`on conflict do nothing`, zero `update`/`delete`/`drop`),
  auto-consistența antetului (numărul de rânduri declarat = tuplurile scrise).
- `tests/database/content-seeds.mjs` — creează cele trei tabele într-un PostgreSQL real (PGlite), aplică
  seed-urile, compară numărul de rânduri cu cel din antet și rulează din nou fiecare fișier pentru a
  dovedi idempotența.
- `npm run content:export:check` — compară amprenta de pe disc cu baza reală.
