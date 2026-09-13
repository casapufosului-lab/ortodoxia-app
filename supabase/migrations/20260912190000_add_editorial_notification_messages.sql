begin;

create table if not exists public.notification_messages (
  id bigserial primary key,
  language_code text not null,
  country_code text,
  calendar_code text,
  day_type text not null check (day_type in ('daily', 'sunday', 'fasting', 'red_cross')),
  theme text not null,
  title_template text not null,
  body_template text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (language_code ~ '^[a-z]{2}$'),
  check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  check (calendar_code is null or calendar_code ~ '^[a-z0-9-]+$')
);

create index if not exists notification_messages_lookup_idx
  on public.notification_messages(language_code, country_code, calendar_code, day_type, is_active);

alter table public.notification_messages enable row level security;

drop policy if exists "notification_messages_read_active" on public.notification_messages;
create policy "notification_messages_read_active"
  on public.notification_messages
  for select
  to anon, authenticated
  using (is_active = true);

drop trigger if exists notification_messages_set_updated_at on public.notification_messages;
create trigger notification_messages_set_updated_at
  before update on public.notification_messages
  for each row execute function public.set_updated_at();

insert into public.notification_messages (
  language_code,
  country_code,
  calendar_code,
  day_type,
  theme,
  title_template,
  body_template,
  is_active
) values
  ('ro', null, null, 'daily', 'peace', 'Gândul zilei', '{verse_text} ({verse_source}) Începe ziua cu pace și cu o rugăciune scurtă.', true),
  ('ro', null, null, 'daily', 'hope', 'Gândul zilei', '{verse_text} ({verse_source}) Domnul să-ți lumineze pașii de astăzi.', true),
  ('ro', null, null, 'daily', 'prayer', 'Gândul zilei', '{verse_text} ({verse_source}) Păstrează în inimă un gând bun și o rugăciune curată.', true),
  ('ro', null, null, 'daily', 'gratitude', 'Gândul zilei', '{verse_text} ({verse_source}) Mulțumește pentru ziua aceasta și mergi cu nădejde.', true),
  ('ro', null, null, 'sunday', 'sunday', 'Duminică binecuvântată', '{verse_text} ({verse_source}) Astăzi este duminică. Fă loc în zi pentru rugăciune și pace.', true),
  ('ro', null, null, 'sunday', 'gospel', 'Duminică binecuvântată', '{verse_text} ({verse_source}) Duminica ne cheamă să ne apropiem de Dumnezeu cu inimă liniștită.', true),
  ('ro', null, null, 'fasting', 'fasting', 'Gând de post', '{verse_text} ({verse_source}) Dacă astăzi este zi de post, primește-o cu răbdare, cumpătare și rugăciune.', true),
  ('ro', null, null, 'fasting', 'patience', 'Gând de post', '{verse_text} ({verse_source}) Postul se ține și cu inima: mai multă blândețe, mai puțină tulburare.', true),
  ('ro', null, null, 'red_cross', 'feast', 'Sărbătoare binecuvântată', 'Astăzi este sărbătoare mare: {feast_title}. {verse_text} ({verse_source}) Dumnezeu să-ți dăruiască pace și lumină.', true),
  ('ro', null, null, 'red_cross', 'light', 'Sărbătoare binecuvântată', '{feast_title}. {verse_text} ({verse_source}) Să fie zi cu bucurie, rugăciune și lumină.', true),

  ('en', null, null, 'daily', 'peace', 'Thought of the Day', '{verse_text} ({verse_source}) Begin this day with peace and a short prayer.', true),
  ('en', null, null, 'daily', 'hope', 'Thought of the Day', '{verse_text} ({verse_source}) May the Lord guide your steps today.', true),
  ('en', null, null, 'daily', 'prayer', 'Thought of the Day', '{verse_text} ({verse_source}) Keep a good thought and a clean prayer in your heart.', true),
  ('en', null, null, 'daily', 'gratitude', 'Thought of the Day', '{verse_text} ({verse_source}) Give thanks for this day and walk with hope.', true),
  ('en', null, null, 'sunday', 'sunday', 'Blessed Sunday', '{verse_text} ({verse_source}) Today is Sunday. Make room for prayer and peace.', true),
  ('en', null, null, 'sunday', 'gospel', 'Blessed Sunday', '{verse_text} ({verse_source}) Sunday calls us to draw near to God with a quiet heart.', true),
  ('en', null, null, 'fasting', 'fasting', 'Fasting Thought', '{verse_text} ({verse_source}) If today is a fasting day, receive it with patience, temperance, and prayer.', true),
  ('en', null, null, 'fasting', 'patience', 'Fasting Thought', '{verse_text} ({verse_source}) Fasting is also kept in the heart: more gentleness, less unrest.', true),
  ('en', null, null, 'red_cross', 'feast', 'Blessed Feast', 'Today is a great feast: {feast_title}. {verse_text} ({verse_source}) May God grant you peace and light.', true),
  ('en', null, null, 'red_cross', 'light', 'Blessed Feast', '{feast_title}. {verse_text} ({verse_source}) May this be a day of joy, prayer, and light.', true)
on conflict do nothing;

commit;
