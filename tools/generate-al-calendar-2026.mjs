import fs from 'node:fs/promises';
import path from 'node:path';

const YEAR = 2026;
const COUNTRY = 'AL';
const NATIVE_LANG = 'sq';
const CALENDAR_CODE = 'al-orthodox-autocephalous-church';
const SOURCE_BASE = 'https://orthodoxalbania.org/2026/wp-content/plugins/orthodox-calendar/data';
const SOURCE_VERSION = '0.5.536';
const SOURCE_LABEL = 'Official Orthodox Autocephalous Church of Albania calendar JSON';
const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

const root = process.cwd();
const dataPath = path.join(root, 'src', 'data', 'al-calendar-2026.json');
const nativeMigrationPath = path.join(
  root,
  'supabase',
  'migrations',
  '20260912060000_seed_al_orthodox_calendar_2026.sql',
);
const enMigrationPath = path.join(
  root,
  'supabase',
  'migrations',
  '20260912060100_seed_al_calendar_english_translations.sql',
);

const fastingLabels = {
  strict: 'Strict fast',
  strict_fast: 'Strict fast',
  oil_wine: 'Oil and wine',
  fish_permitted: 'Fish permitted',
  fasting_fish: 'Fish permitted',
  all_permitted: 'All foods permitted',
};

function isoDate(month, day) {
  return `${YEAR}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function sql(value) {
  if (value == null || value === '') return 'null';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function plainText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function stripDiacritics(value) {
  return plainText(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function titleFromCommemorations(commemorations, language) {
  return [...(commemorations ?? [])]
    .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
    .map((item) => plainText(item[language] || item.en || item.sq || item.el))
    .filter(Boolean)
    .join('; ');
}

function detailsFromDay(day, title, language) {
  const parts = [title];
  if (day.note) {
    if (typeof day.note === 'string') parts.push(day.note);
    else parts.push(day.note[language] || day.note.en || day.note.sq || day.note.el);
  }
  if (day.readings?.epistle?.display) parts.push(`Epistle: ${day.readings.epistle.display}`);
  if (day.readings?.gospel?.display) parts.push(`Gospel: ${day.readings.gospel.display}`);
  return parts.filter(Boolean).map(plainText).join(' | ');
}

function nativeFastingNote(day) {
  if (day.note) {
    return typeof day.note === 'string'
      ? plainText(day.note)
      : plainText(day.note.sq || day.note.en || day.note.el);
  }
  return day.fasting ? fastingLabels[day.fasting] ?? day.fasting : null;
}

function englishFastingNote(day) {
  if (day.note) {
    return typeof day.note === 'string'
      ? stripDiacritics(day.note)
      : stripDiacritics(day.note.en || day.note.sq || day.note.el);
  }
  return day.fasting ? fastingLabels[day.fasting] ?? stripDiacritics(day.fasting) : null;
}

function fallbackEnglish(value) {
  return stripDiacritics(value)
    .replace(/\bHyjlindeses\b/g, 'Theotokos')
    .replace(/\bHyjlindesja\b/g, 'Theotokos')
    .replace(/\bZotit\b/g, 'Lord')
    .replace(/\bJisu Krisht\b/g, 'Jesus Christ')
    .replace(/\bKrishtlindje\b/g, 'Nativity of Christ')
    .replace(/\bNgjallja\b/g, 'Resurrection')
    .replace(/\bDëshmg?\./g, 'Great Martyr')
    .replace(/\bDësh\./g, 'Martyr')
    .replace(/\bOshg?\./g, 'Venerable')
    .replace(/\bHierod\./g, 'Hieromartyr')
    .replace(/\bAp\./g, 'Apostle')
    .replace(/\bPr\./g, 'Prophet');
}

function validate(entries) {
  const dates = entries.map((entry) => entry.calendar_date);
  const unique = new Set(dates);
  const expected = [];
  for (let d = new Date(`${YEAR}-01-01T00:00:00Z`); d.getUTCFullYear() === YEAR; d.setUTCDate(d.getUTCDate() + 1)) {
    expected.push(d.toISOString().slice(0, 10));
  }
  const missing = expected.filter((date) => !unique.has(date));
  const duplicates = dates.filter((date, index) => dates.indexOf(date) !== index);
  if (entries.length !== 365 || unique.size !== 365 || missing.length || duplicates.length) {
    throw new Error(
      `Invalid AL calendar: rows=${entries.length}, unique=${unique.size}, missing=${missing.join(',')}, duplicates=${duplicates.join(',')}`,
    );
  }
  if (dates[0] !== '2026-01-01' || dates.at(-1) !== '2026-12-31') {
    throw new Error(`Invalid AL date range: ${dates[0]} to ${dates.at(-1)}`);
  }
}

function nativeMigration(entries) {
  const rows = entries
    .map(
      (entry) =>
        `(${sql(COUNTRY)},${sql(NATIVE_LANG)},${sql(CALENDAR_CODE)},${sql(entry.calendar_date)},${sql(entry.feast_rank)},array[]::text[],${sql(entry.title)},${sql(entry.details)},${sql(entry.fasting_note)},${sql(entry.editorial_source)},true)`,
    )
    .join(',\n');

  return `begin;

-- Orthodox Autocephalous Church of Albania calendar 2026.
-- Source: https://orthodoxalbania.org/2026/kalendari-kishtar/
-- JSON data: ${SOURCE_BASE}/{month}.json?v=${SOURCE_VERSION}

delete from public.calendar_day_translations t
using public.calendar_days d
where t.calendar_day_id = d.id
  and d.country_code = 'AL'
  and d.calendar_code = '${CALENDAR_CODE}'
  and d.calendar_date between date '2026-01-01' and date '2026-12-31';

delete from public.calendar_days
where country_code = 'AL'
  and calendar_code = '${CALENDAR_CODE}'
  and calendar_date between date '2026-01-01' and date '2026-12-31';

insert into public.calendar_days (
  country_code, language_code, calendar_code, calendar_date,
  feast_rank, saints, title, details, fasting_note,
  editorial_source, is_published
) values
${rows};

commit;
`;
}

function translationMigration(entries) {
  const rows = entries
    .map((entry) => `(date ${sql(entry.calendar_date)},${sql(entry.en_title)},${sql(entry.en_details)},${sql(entry.en_fasting_note)})`)
    .join(',\n');

  return `begin;

do $$
declare
  native_count integer;
begin
  select count(*)
    into native_count
  from public.calendar_days
  where country_code = 'AL'
    and calendar_code = '${CALENDAR_CODE}'
    and language_code = 'sq'
    and calendar_date between date '2026-01-01' and date '2026-12-31';

  if native_count <> 365 then
    raise exception 'Expected 365 native AL rows; found %', native_count;
  end if;
end
$$;

with payload(calendar_date, title, details, fasting_note) as (
values
${rows}
)
insert into public.calendar_day_translations (
  calendar_day_id, language_code, title, details, fasting_note
)
select d.id, 'en', p.title, p.details, p.fasting_note
from payload p
join public.calendar_days d
  on d.country_code = 'AL'
 and d.calendar_code = '${CALENDAR_CODE}'
 and d.language_code = 'sq'
 and d.calendar_date = p.calendar_date
on conflict (calendar_day_id, language_code) do update
set title = excluded.title,
    details = excluded.details,
    fasting_note = excluded.fasting_note;

do $$
declare
  translated_count integer;
begin
  select count(*)
    into translated_count
  from public.calendar_day_translations t
  join public.calendar_days d on d.id = t.calendar_day_id
  where d.country_code = 'AL'
    and d.calendar_code = '${CALENDAR_CODE}'
    and d.language_code = 'sq'
    and d.calendar_date between date '2026-01-01' and date '2026-12-31'
    and t.language_code = 'en';

  if translated_count <> 365 then
    raise exception 'Expected 365 English AL translations; found %', translated_count;
  end if;
end
$$;

commit;
`;
}

const entries = [];
for (const [index, monthName] of MONTHS.entries()) {
  const month = index + 1;
  const sourceUrl = `${SOURCE_BASE}/${monthName}.json?v=${SOURCE_VERSION}`;
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`Failed to fetch ${sourceUrl}: ${response.status}`);
  const data = await response.json();

  for (const day of data.days ?? []) {
    const title = titleFromCommemorations(day.commemorations, 'sq');
    const enTitleRaw = titleFromCommemorations(day.commemorations, 'en');
    const enTitle = enTitleRaw ? stripDiacritics(enTitleRaw) : fallbackEnglish(title);
    const enDetailsRaw = detailsFromDay(day, enTitleRaw || title, 'en');
    entries.push({
      calendar_date: isoDate(month, day.day),
      title,
      saints: [],
      feast_rank: (day.commemorations ?? []).some((item) => item.type === 'great_feast') ? 'cruce roșie' : 'cruce neagră',
      fasting_note: nativeFastingNote(day),
      details: detailsFromDay(day, title, 'sq'),
      editorial_source: `${SOURCE_LABEL}, ${sourceUrl}`,
      en_title: enTitle,
      en_details: enTitleRaw ? stripDiacritics(enDetailsRaw) : fallbackEnglish(enDetailsRaw),
      en_fasting_note: englishFastingNote(day),
    });
  }
}

entries.sort((a, b) => a.calendar_date.localeCompare(b.calendar_date));
validate(entries);

const jsonEntries = entries.map(({ en_title, en_details, en_fasting_note, ...entry }) => entry);
await fs.writeFile(dataPath, `${JSON.stringify(jsonEntries, null, 2)}\n`);
await fs.writeFile(nativeMigrationPath, nativeMigration(jsonEntries));
await fs.writeFile(enMigrationPath, translationMigration(entries));

const redCount = entries.filter((entry) => entry.feast_rank === 'cruce roșie').length;
console.log(`Generated AL calendar: ${entries.length} rows, ${redCount} red-cross days`);
console.log(dataPath);
console.log(nativeMigrationPath);
console.log(enMigrationPath);
