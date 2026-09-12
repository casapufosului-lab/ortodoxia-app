import { readFileSync, writeFileSync } from 'node:fs';

const rows = JSON.parse(readFileSync('src/data/ru-calendar-2026.json', 'utf8'));
const calendarCode = 'by-belarusian-orthodox-church';

function sql(value) {
  if (value === null || value === undefined || value === '') return 'null';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function byRow(row) {
  return {
    calendar_date: row.calendar_date,
    title: row.title,
    saints: [],
    feast_rank: row.feast_rank,
    fasting_note: row.fasting_note,
    details: row.details,
    editorial_source:
      'Belarusian Orthodox Church follows the Moscow Patriarchate liturgical calendar; seeded from the validated Russian Orthodox Church 2026 calendar, cross-referenced with the official Belarusian Orthodox Church portal http://church.by/',
  };
}

const byRows = rows.map(byRow);

function valuesNative(row) {
  return `('BY','ru','${calendarCode}',${sql(row.calendar_date)},${sql(row.feast_rank)},array[]::text[],${sql(row.title)},${sql(row.details)},${sql(row.fasting_note)},${sql(row.editorial_source)},true)`;
}

function valuesEn(row) {
  return `(date ${sql(row.calendar_date)},${sql(row.english_title)},${sql(row.english_details)},${sql(row.english_fasting_note)})`;
}

const dates = byRows.map((row) => row.calendar_date);
if (byRows.length !== 365 || new Set(dates).size !== 365 || dates[0] !== '2026-01-01' || dates.at(-1) !== '2026-12-31') {
  throw new Error('Invalid BY calendar coverage');
}

writeFileSync('src/data/by-calendar-2026.json', `${JSON.stringify(byRows, null, 2)}\n`);

writeFileSync(
  'supabase/migrations/20260912070000_seed_by_belarusian_orthodox_calendar_2026.sql',
  `begin;

-- Belarusian Orthodox Church calendar 2026.
-- The Belarusian Orthodox Church is the Belarusian Exarchate of the Moscow Patriarchate.
-- Source basis: validated Russian Orthodox Church 2026 liturgical calendar; official Belarusian portal: http://church.by/

delete from public.calendar_day_translations t
using public.calendar_days d
where t.calendar_day_id = d.id
  and d.country_code = 'BY'
  and d.calendar_code = '${calendarCode}'
  and d.calendar_date between date '2026-01-01' and date '2026-12-31';

delete from public.calendar_days
where country_code = 'BY'
  and calendar_code = '${calendarCode}'
  and calendar_date between date '2026-01-01' and date '2026-12-31';

insert into public.calendar_days (
  country_code, language_code, calendar_code, calendar_date,
  feast_rank, saints, title, details, fasting_note,
  editorial_source, is_published
) values
${byRows.map(valuesNative).join(',\n')};

do $$
declare
  row_count integer;
  unique_count integer;
  first_date date;
  last_date date;
begin
  select count(*), count(distinct calendar_date), min(calendar_date), max(calendar_date)
    into row_count, unique_count, first_date, last_date
  from public.calendar_days
  where country_code = 'BY'
    and calendar_code = '${calendarCode}'
    and language_code = 'ru'
    and calendar_date between date '2026-01-01' and date '2026-12-31';

  if row_count <> 365 or unique_count <> 365 or first_date <> date '2026-01-01' or last_date <> date '2026-12-31' then
    raise exception 'Invalid BY calendar coverage: rows %, unique %, first %, last %', row_count, unique_count, first_date, last_date;
  end if;
end
$$;

commit;
`,
);

writeFileSync(
  'supabase/migrations/20260912070100_seed_by_calendar_english_translations.sql',
  `begin;

do $$
declare
  native_count integer;
begin
  select count(*)
    into native_count
  from public.calendar_days
  where country_code = 'BY'
    and calendar_code = '${calendarCode}'
    and language_code = 'ru'
    and calendar_date between date '2026-01-01' and date '2026-12-31';

  if native_count <> 365 then
    raise exception 'Expected 365 native BY rows; found %', native_count;
  end if;
end
$$;

with payload(calendar_date, title, details, fasting_note) as (
values
${rows.map(valuesEn).join(',\n')}
)
insert into public.calendar_day_translations (
  calendar_day_id, language_code, title, saints, details, fasting_note
)
select d.id, 'en', p.title, d.saints, p.details, p.fasting_note
from payload p
join public.calendar_days d
  on d.country_code = 'BY'
 and d.calendar_code = '${calendarCode}'
 and d.language_code = 'ru'
 and d.calendar_date = p.calendar_date
on conflict (calendar_day_id, language_code) do update set
  title = excluded.title,
  saints = excluded.saints,
  details = excluded.details,
  fasting_note = excluded.fasting_note,
  updated_at = timezone('utc', now());

do $$
declare
  translation_count integer;
begin
  select count(*)
    into translation_count
  from public.calendar_days d
  join public.calendar_day_translations t on t.calendar_day_id = d.id
  where d.country_code = 'BY'
    and d.calendar_code = '${calendarCode}'
    and d.language_code = 'ru'
    and d.calendar_date between date '2026-01-01' and date '2026-12-31'
    and t.language_code = 'en';

  if translation_count <> 365 then
    raise exception 'Expected 365 BY English translations; found %', translation_count;
  end if;
end
$$;

commit;
`,
);

console.log(`Generated BY calendar: ${byRows.length} rows, ${byRows.filter((row) => row.feast_rank === 'cruce roșie').length} red-cross days`);
