insert into public.daily_content (
  content_date,
  verse_text,
  verse_source,
  parable_title,
  parable_text,
  editorial_source,
  is_published
)
values (
  '2026-08-30',
  'Piatra pe care au nesocotit-o ziditorii, aceasta a ajuns să fie în capul unghiului.',
  'Matei 21, 42',
  'Pilda lucrătorilor răi',
  'Dumnezeu ne încredințează daruri și așteaptă roade bune: credință lucrătoare, dreptate și iubire față de aproapele.',
  'Calendarul Patriarhiei Române și Basilica.ro. Validarea editorială finală este necesară înainte de lansare.',
  true
)
on conflict (content_date) do update set
  verse_text = excluded.verse_text,
  verse_source = excluded.verse_source,
  parable_title = excluded.parable_title,
  parable_text = excluded.parable_text,
  editorial_source = excluded.editorial_source,
  is_published = excluded.is_published,
  updated_at = timezone('utc', now());

insert into public.calendar_days (
  calendar_date,
  feast_rank,
  saints,
  title,
  details,
  fasting_note,
  editorial_source,
  is_published
)
values (
  '2026-08-30',
  'Duminica a 13-a după Rusalii',
  array[
    'Sfântul Ierarh Varlaam, Mitropolitul Moldovei',
    'Sfântul Ierarh Ioan de la Râșca și Secu, episcopul Romanului',
    'Sfinții Ierarhi Alexandru, Ioan și Pavel cel Nou, patriarhii Constantinopolului'
  ],
  'Sfinții Ierarhi Varlaam și Ioan; Sfinții Ierarhi Alexandru, Ioan și Pavel cel Nou',
  'Duminica a 13-a după Rusalii. Evanghelia zilei: Matei 21, 33-44, Pilda lucrătorilor răi.',
  null,
  'Calendarul Patriarhiei Române și Basilica.ro. Validarea editorială finală este necesară înainte de lansare.',
  true
)
on conflict (calendar_date) do update set
  feast_rank = excluded.feast_rank,
  saints = excluded.saints,
  title = excluded.title,
  details = excluded.details,
  fasting_note = excluded.fasting_note,
  editorial_source = excluded.editorial_source,
  is_published = excluded.is_published,
  updated_at = timezone('utc', now());
