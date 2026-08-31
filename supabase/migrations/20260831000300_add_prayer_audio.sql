alter table public.prayers
  add column if not exists audio_path text
    check (audio_path is null or audio_path ~ '^[a-z]{2,3}/[a-z0-9-]+\.mp3$');

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'prayer-audio',
  'prayer-audio',
  true,
  15728640,
  array['audio/mpeg']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "prayer_audio_public_read" on storage.objects;

create policy "prayer_audio_public_read"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'prayer-audio');
