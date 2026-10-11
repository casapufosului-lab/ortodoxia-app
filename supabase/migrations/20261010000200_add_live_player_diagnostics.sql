-- 20261010000200 · RUNDA FINALĂ — diagnosticul playerului live, citit de pe server
--
-- DE CE EXISTĂ ACEST FIȘIER
-- ─────────────────────────
-- Playerul live rămâne negru pe iPhone din build 11 încoace. Toate variantele încercate
-- (11-19) au fost măsurate „pe nevăzut": singurul canal de citire era ecranul telefonului,
-- citit de owner cu telefonul în mână, iar rândul care conta (adresa de la `onLoadEnd`) nu a
-- fost niciodată citit. Runda 20 a pus toate faptele pe ecran, dar citirea rămâne manuală.
--
-- Tabelul de aici este canalul care închide întrebarea fără poze: aplicația trimite, la
-- deschiderea unui live, EXACT valorile care se afișează pe ecran (aceleași expresii), iar
-- DSH le citește cu `service_role` direct din bază și le interpretează după tabelul de decizie:
--   referrer plin + video_size ≠ 0  → încărcarea nu mai e problema (dacă ecranul e negru:
--                                     desenare/compunere în WebKit);
--   referrer gol                    → WKWebView nu duce referrer-ul în document → pasul
--                                     următor: pagină reală servită de domeniul nostru;
--   page_text conține „Error 153"   → YouTube refuză embed-ul în WKWebView;
--   page_url gol                    → încărcarea nu se termină niciodată (`onLoadEnd` nu vine).
--
-- CINE POATE SCRIE / CITI
-- ───────────────────────
-- RLS este ACTIVAT și NU există nicio policy: pentru `anon` și `authenticated` tabelul este
-- inaccesibil (nici măcar nu se vede că există). Singurul care scrie și citește este funcția
-- Edge `live-player-diagnostic`, cu `service_role` (care ocolește RLS-ul prin definiție).
-- Clientul (aplicația) NU are voie să scrie direct în tabel: altfel oricine cu cheia publică
-- ar putea umple tabelul. Drepturile implicite sunt revocate explicit, nu doar presupuse.
--
-- DATE PERSONALE
-- ──────────────
-- Nu se stochează nimic personal: sunt măsurători ale paginii YouTube (adresă, cod HTTP,
-- referrer, mărimea elementului video, textul vizibil al paginii) plus versiunea aplicației și
-- numele sistemului. `user_id` este singurul câmp care ar putea identifica un om, este NULL
-- azi (aplicația nu trimite utilizatorul) și rămâne fără cheie străină, deliberat: un diagnostic
-- nu are ce să caute în cascada contului. Pentru că ține totuși un UUID de utilizator fără FK,
-- poarta `scripts/lib/deletion-coverage.mjs` îl vede ca tabelă-jurnal de audit (poziția B3) și
-- cere acoperire explicită: rândurile se șterg în `supabase/functions/delete-account/core.ts`
-- (pasul 10, după `profiles`), nu prin cascadă și nu printr-o excepție declarată.
--
-- IDEMPOTENT: `if not exists` peste tot, deci poate fi rulat de oricâte ori.

create table if not exists public.live_player_diagnostics (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  -- Identificatorul videoclipului deschis (ex. „abc123"); rândul de probă are '__smoke__'.
  video_id text,
  -- Adresa finală a încărcării, luată din `onLoadEnd`; '...' înseamnă „încărcarea nu s-a terminat".
  page_url text,
  -- Codul HTTP, doar dacă WebView-ul a raportat un răspuns eșuat (`onHttpError`).
  http_status text,
  -- Textul erorii raportate de WebView (`onError`).
  error_text text,
  -- `document.referrer` așa cum îl vede pagina YouTube (linia `ref=`); gol dacă nu ajunge.
  referrer text,
  -- Existența și mărimea elementului `<video>` (linia `video=`), ex. „video=390x720" sau „video=nu".
  video_size text,
  -- Cutia măsurată de WebView pe ecran (linia `webview=`), ex. „390x219".
  webview_size text,
  -- Starea de încărcare din evenimente (linia `incarcat=`): true = pagina s-a încărcat.
  loaded boolean,
  -- Textul vizibil al paginii, cu „Error 153" verbatim dacă YouTube refuză embed-ul.
  page_text text,
  -- Versiunea aplicației și sistemul (ex. „ios 18.5"): fără ele, un rând nu poate fi atribuit
  -- unui build, iar diagnosticul nu ar putea distinge un „merge" de unul „nu merge".
  app_version text,
  device text,
  -- NULL azi (vezi „DATE PERSONALE" mai sus); fără cheie străină, deliberat.
  user_id uuid
);

-- Citirea este mereu „cele mai noi primele" (DSH citește ultimul rând după o deschidere).
create index if not exists live_player_diagnostics_created_at_idx
  on public.live_player_diagnostics (created_at desc);

alter table public.live_player_diagnostics enable row level security;

-- Nicio policy: RLS activat fără policy = tabel închis pentru toți în afară de service_role.
-- Comentariul de aici este singurul loc care explică de ce lipsesc politicile, ca un agent
-- următor să nu creadă că au fost uitate și să adauge una pentru `anon`.

-- Tabelul nou nu trebuie să rămână cu privilegiile implicite pentru `anon`/`authenticated`.
revoke all on public.live_player_diagnostics from anon;
revoke all on public.live_player_diagnostics from authenticated;
-- Secvența, altfel un `insert` cu service_role ar putea fi blocat de lipsa dreptului pe sequence.
revoke all on sequence public.live_player_diagnostics_id_seq from anon;
revoke all on sequence public.live_player_diagnostics_id_seq from authenticated;

comment on table public.live_player_diagnostics is
  'Măsurători ale playerului live trimise de aplicație (aceleași valori ca pe ecran). Scrise și citite cu service_role prin funcția Edge live-player-diagnostic; RLS activat fără nicio policy.';
