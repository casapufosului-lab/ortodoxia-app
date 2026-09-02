-- Securizare explicită `subscriptions`: utilizatorii obișnuiți nu pot scrie.
-- Singura sursă de scriere este webhook-ul RevenueCat (service role), iar
-- citirea rămâne permisă doar pentru rândul propriu (politica
-- subscriptions_select_own creată în 20260830000100_add_subscriptions.sql).
--
-- Chiar dacă default-ul RLS este deja deny, aceste politici fac intenția
-- explicită și apără împotriva unor politici viitoare prea permisive.

alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions_block_insert_authenticated" on public.subscriptions;
create policy "subscriptions_block_insert_authenticated"
  on public.subscriptions
  for insert
  to authenticated
  with check (false);

drop policy if exists "subscriptions_block_update_authenticated" on public.subscriptions;
create policy "subscriptions_block_update_authenticated"
  on public.subscriptions
  for update
  to authenticated
  using (false)
  with check (false);

drop policy if exists "subscriptions_block_delete_authenticated" on public.subscriptions;
create policy "subscriptions_block_delete_authenticated"
  on public.subscriptions
  for delete
  to authenticated
  using (false);