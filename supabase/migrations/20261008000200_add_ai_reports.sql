-- ============================================================================
--  Raportări ale răspunsurilor date de asistentul AI
-- ============================================================================
--
--  DE CE
--  Politica Google Play pentru conținut generat de AI cere ca utilizatorul să poată semnala
--  un răspuns ofensator sau periculos, iar AGENTS.md (regula 36) cere același lucru la nivel de
--  produs. Până acum singurul canal era adresa de suport din Setări, adică un om supărat trebuia
--  să iasă din aplicație, să-și copieze răspunsul și să scrie un e-mail. Aici nu se poate dovedi
--  nici că raportul a ajuns, nici că cineva l-a citit.
--
--  CE SE SALVEAZĂ (și ce NU)
--  Se salvează motivul, textul răspunsului raportat (maximum 4000 de caractere) și identificatorul
--  conversației — atât cât e nevoie ca un moderator să judece cazul fără să citească toată
--  conversația. NU se salvează copii ale întrebărilor, nu se salvează adresa de e-mail și nu se
--  salvează nimic din datele de autentificare. Textul raportat este deja stocat în conversația
--  utilizatorului (`ai_chat_messages`), deci nu se deschide o categorie nouă de date în politica
--  de confidențialitate; se adaugă doar motivul.
--
--  CINE POATE SCRIE
--  Fiecare utilizator autentificat (inclusiv sesiunea anonimă folosită de chatul pentru vizitatori)
--  își poate scrie DOAR rândurile lui, prin `user_id default auth.uid()`. Nu poate citi raportările
--  altcuiva, nu poate modifica și nu poate șterge nimic: coada de moderare rămâne intactă, iar un
--  raport nu poate fi făcut să dispară de cel care l-a trimis. Coloanele `status`,
--  `reviewed_at` și `review_note` sunt scrise de owner cu service_role (o operație care ocolește
--  RLS-ul), pentru că nu există încă un panou de moderare în aplicație.
--
--  ANTI-SPAM
--  Un index unic pe (user_id, md5(message_text)) face ca același text raportat de două ori de
--  același om să fie un singur rând. Clientul tratează eroarea de duplicat ca "deja raportat",
--  nu ca o eroare pentru utilizator.
--
--  ȘTERGEREA CONTULUI
--  Rândurile pleacă odată cu utilizatorul (`on delete cascade`), la fel ca la celelalte tabele,
--  deci `supabase/functions/delete-account/index.ts` nu are nevoie de nimic în plus.
-- ============================================================================

create table if not exists public.ai_reports (
  id uuid primary key default gen_random_uuid(),
  -- `auth.uid()` ca valoare implicită: clientul nu poate trimite un `user_id` străin nici din
  -- greșeală, nici intenționat, iar sesiunea anonimă a chatului pentru vizitatori se
  -- identifică la fel ca un cont obișnuit.
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reason text not null check (reason in ('offensive', 'harmful')),
  message_text text not null check (char_length(message_text) between 1 and 4000),
  -- Identificatorul conversației, așa cum îl ține clientul; poate lipsi (chatul vizitatorului nu
  -- are conversație salvată), de aceea e nullable și fără cheie străină.
  thread_id text,
  -- Limba în care era aplicația când s-a făcut raportarea: util pentru triaj și pentru a vedea
  -- dacă o limbă are probleme repetate de traducere în răspunsurile AI.
  app_language text,
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at timestamptz not null default timezone('utc', now()),
  reviewed_at timestamptz,
  review_note text
);

-- coada de moderare se citește mereu "cele nerezolvate, cele mai noi primele"
create index if not exists ai_reports_status_created_at_idx
  on public.ai_reports (status, created_at desc);

-- A doua raportare a aceluiași text, de același om, nu adaugă un rând nou (anti-spam).
create unique index if not exists ai_reports_user_text_key
  on public.ai_reports (user_id, md5(message_text));

alter table public.ai_reports enable row level security;

-- Fiecare om își scrie și își citește doar propriile raportări.
create policy "ai_reports_select_own"
  on public.ai_reports for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "ai_reports_insert_own"
  on public.ai_reports for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- Nu există politici de update sau delete: un raport trimis nu poate fi modificat ori șters de
-- cel care l-a trimis. Moderarea (status/reviewed_at/review_note) se face cu service_role.

-- Drepturi explicite: tabelul nou nu trebuie să rămână cu privilegiile implicite pentru `anon`
-- și fără update/delete pentru utilizatori.
revoke all on public.ai_reports from anon;
revoke all on public.ai_reports from authenticated;
grant select, insert on public.ai_reports to authenticated;

comment on table public.ai_reports is
  'Raportări ale răspunsurilor AI (ofensatoare/periculoase). Scrise de utilizator, citite/moderate de owner cu service_role.';
