create table if not exists public.bible_verses (
  translation_id text not null,
  book_code text not null,
  chapter integer not null check (chapter > 0),
  verse integer not null check (verse > 0),
  verse_text text not null,
  is_published boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (translation_id, book_code, chapter, verse)
);

create index if not exists bible_verses_chapter_idx
  on public.bible_verses (translation_id, book_code, chapter, verse)
  where is_published = true;

alter table public.bible_verses enable row level security;

drop policy if exists "Public can read published Bible verses" on public.bible_verses;
create policy "Public can read published Bible verses"
on public.bible_verses
for select
to anon, authenticated
using (is_published = true);
