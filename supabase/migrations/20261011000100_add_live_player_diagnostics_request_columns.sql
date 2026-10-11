-- 20261011000100 · BUILD 21 — canalul de diagnostic primeste adresa cererii si starea paginii
--
-- DE CE EXISTA ACEST FISIER
-- ---------------------------------------------------------------------------
-- Cele 7 randuri din `live_player_diagnostics` (build 20, doua streamuri diferite) arata acelasi
-- tablou: `page_url = about:blank`, fara cod HTTP, fara eroare, `loaded = true`. Documentul comis
-- era gol, iar canalul care lipsea este adresa pe care WebView-ul a CERUT-o (`onLoadStart`) plus
-- mesajele paginii noastre. Fara ele, verdictul din build 21 s-ar citi iar de pe ecranul telefonului.
--
-- CE FACE (aditiv, un singur pas, reversibil)
-- ---------------------------------------------------------------------------
--   `requested_url` — URL-ul cererii (NU al documentului comis: acela este `page_url`).
--   `page_state`    — mesajele paginii, in ordine: `page-ready|api-ready|state(5)`.
-- Randurile existente raman cu NULL; nu se modifica nimic existent.
--
-- DE CE `requested_url IS NOT NULL` ESTE SINGURUL MARKER AL BUILD-ULUI 21
-- ---------------------------------------------------------------------------
-- `app_version` este "1.0.0" in TOATE randurile (masurat 11.10.2026), deci nu distinge build-urile.
-- Build-urile <= 20 nu pot trimite aceste doua campuri: functia Edge le refuza ca `unknown_field`
-- inainte de acest commit. Deci un rand cu `requested_url` non-null nu poate veni decat din 21+.
--
-- CINE POATE SCRIE / CITI
-- ---------------------------------------------------------------------------
-- Neschimbat: RLS activ, fara policy (anon/authenticated nu vad tabelul), singurul scriitor este
-- functia Edge `live-player-diagnostic` cu `service_role`. Coloanele noi nu primesc niciun grant.
--
-- DATE PERSONALE
-- ---------------------------------------------------------------------------
-- `requested_url` este URL-ul propriu al aplicatiei (`https://ortodoxia.web.app/live-embed?v=...`),
-- nu contine date despre persoana; `page_state` este o lista de etichete interne (fara textul
-- paginii). Limitele de lungime raman cele din functie (2048 B pe camp, 4096 B pe corp).

alter table public.live_player_diagnostics
  add column if not exists requested_url text,
  add column if not exists page_state text;

comment on column public.live_player_diagnostics.requested_url is
  'URL-ul cererii trimise de WebView (onLoadStart). NULL pe build-urile <= 20.';
comment on column public.live_player_diagnostics.page_state is
  'Mesajele paginii, in ordine: page-ready|api-ready|state(5). NULL pe build-urile <= 20.';
