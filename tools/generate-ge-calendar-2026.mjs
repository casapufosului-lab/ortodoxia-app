import fs from 'node:fs/promises';
import path from 'node:path';

const YEAR = 2026;
const COUNTRY = 'GE';
const NATIVE_LANG = 'ka';
const CALENDAR_CODE = 'ge-georgian-orthodox-church';
const SOURCE_URL = 'https://sasoeba.ge/ka/kalendari/2026';
const SOURCE_LABEL =
  'Sasoeba Georgian Orthodox calendar 2026, cross-checked where available against the official Patriarchate calendar endpoint';

const root = process.cwd();
const dataPath = path.join(root, 'src', 'data', 'ge-calendar-2026.json');
const nativeMigrationPath = path.join(
  root,
  'supabase',
  'migrations',
  '20260912050000_seed_ge_georgian_orthodox_calendar_2026.sql',
);
const enMigrationPath = path.join(
  root,
  'supabase',
  'migrations',
  '20260912050100_seed_ge_calendar_english_translations.sql',
);

function decodeHtml(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isoDate(month, day) {
  return `${YEAR}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function sql(value) {
  if (value == null || value === '') return 'null';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function removeGeorgianPunctuation(text) {
  return text.replace(/[„“]/g, '"').replace(/\*/g, '');
}

const replacements = [
  [/ბრწყინვალე აღდგომა იესო ქრისტესი/g, 'Bright Pascha of Jesus Christ'],
  [/ხორციელად შობა უფლისა ღმრთისა და მაცხოვრისა ჩვენისა იესო ქრისტესი/g, 'Nativity of Our Lord God and Savior Jesus Christ'],
  [/განცხადება უფლისა ღმრთისა და მაცხოვრისა ჩვენისა იესუ ქრისტესი/g, 'Holy Theophany of Our Lord God and Savior Jesus Christ'],
  [/იესო ქრისტეს დიდებით შესვლა იერუსალიმში/g, 'Entry of Our Lord Jesus Christ into Jerusalem'],
  [/ხარება ყოვლადწმიდისა ღმრთისმშობელისა/g, 'Annunciation of the Most Holy Theotokos'],
  [/ამაღლება უფლისა ჩვენისა იესო ქრისტესი/g, 'Ascension of Our Lord Jesus Christ'],
  [/სულთმოფენობა/g, 'Holy Pentecost'],
  [/ფერისცვალება უფლისა ღმრთისა და მაცხოვრისა ჩვენისა იესუ ქრისტესი/g, 'Transfiguration of Our Lord God and Savior Jesus Christ'],
  [/მიძინება ყოვლადწმიდისა დედუფლისა ჩვენისა ღმრთისმშობელისა და მარადის ქალწულისა მარიამისა/g, 'Dormition of the Most Holy Theotokos and Ever-Virgin Mary'],
  [/შობა ყოვლადწმიდისა ღმრთისმშობელისა და მარადის ქალწულისა მარიამისა/g, 'Nativity of the Most Holy Theotokos and Ever-Virgin Mary'],
  [/მსოფლიო ამაღლება პატიოსნისა და ცხოველსმყოფელისა ჯვარისა/g, 'Universal Exaltation of the Precious and Life-Giving Cross'],
  [/ტაძრადმიყვანება ყოვლადწმიდისა ღმრთისმშობელისა და მარადისქალწულისა მარიამისა/g, 'Entrance of the Most Holy Theotokos and Ever-Virgin Mary into the Temple'],
  [/საუფლო დღესასწაული/g, 'Feast of the Lord'],
  [/დიდი დღესასწაული/g, 'Great Feast'],
  [/ღმრთისმშობლის/g, 'Theotokos'],
  [/ღმრთისმშობელისა/g, 'Theotokos'],
  [/ღმრთისმშობელი/g, 'Theotokos'],
  [/წმიდა/g, 'Saint'],
  [/წმ\./g, 'Saint'],
  [/დიდმოწამისა/g, 'Great Martyr'],
  [/მღვდელმოწამისა/g, 'Hieromartyr'],
  [/მოწამისა/g, 'Martyr'],
  [/ღირსისა/g, 'Venerable'],
  [/მოციქულისა/g, 'Apostle'],
  [/წინასწარმეტყველისა/g, 'Prophet'],
  [/ნათლისმცემელისა/g, 'Forerunner'],
  [/კეთილმორწმუნე/g, 'Right-believing'],
  [/სასწაულთმოქმედისა/g, 'Wonderworker'],
  [/მართლისა/g, 'Righteous'],
  [/კვირა/g, 'Sunday'],
  [/შვიდეული/g, 'Week'],
  [/ორშაბათი/g, 'Monday'],
  [/სამშაბათი/g, 'Tuesday'],
  [/ოთხშაბათი/g, 'Wednesday'],
  [/ხუთშაბათი/g, 'Thursday'],
  [/პარასკევი/g, 'Friday'],
  [/შაბათი/g, 'Saturday'],
  [/მარხვა/g, 'Fast'],
  [/დიდი Fast/g, 'Great Fast'],
  [/თევზით/g, 'Fish allowed'],
  [/მსგეფსი/g, 'Fast-free week'],
  [/ხსნილია/g, 'No fast'],
  [/ხმა:/g, 'Tone:'],
];

const georgianMap = {
  ა: 'a',
  ბ: 'b',
  გ: 'g',
  დ: 'd',
  ე: 'e',
  ვ: 'v',
  ზ: 'z',
  თ: 't',
  ი: 'i',
  კ: 'k',
  ლ: 'l',
  მ: 'm',
  ნ: 'n',
  ო: 'o',
  პ: 'p',
  ჟ: 'zh',
  რ: 'r',
  ს: 's',
  ტ: 't',
  უ: 'u',
  ფ: 'p',
  ქ: 'k',
  ღ: 'gh',
  ყ: 'q',
  შ: 'sh',
  ჩ: 'ch',
  ც: 'ts',
  ძ: 'dz',
  წ: 'ts',
  ჭ: 'ch',
  ხ: 'kh',
  ჯ: 'j',
  ჰ: 'h',
  ჲ: 'y',
};

function transliterate(text) {
  let value = removeGeorgianPunctuation(text);
  for (const [pattern, replacement] of replacements) {
    value = value.replace(pattern, replacement);
  }
  value = [...value].map((char) => georgianMap[char] ?? char).join('');
  return value.replace(/\s+/g, ' ').replace(/\s+([;,.])/g, '$1').trim();
}

function translateFasting(note) {
  if (!note) return null;
  return transliterate(note)
    .replace(/Great Fast/g, 'Great Lent')
    .replace(/Fast-free week/g, 'Fast-free period');
}

function englishTitle(nativeTitle) {
  return transliterate(nativeTitle)
    .replace(/Pascha of Jesus Christ/g, 'Pascha of Our Lord Jesus Christ')
    .replace(/Saint Theotokos/g, 'Holy Theotokos')
    .replace(/\bDidi\b/g, 'Great')
    .replace(/\bKreb[a-z]*\b/gi, 'Synaxis')
    .trim();
}

function parseEntry(label, month, day, className) {
  const parts = decodeHtml(label).split(' — ');
  const title = parts[1] ?? decodeHtml(label);
  const fastingNote = parts.slice(2).join(' • ') || null;
  const isRed =
    className.includes('text-red') ||
    className.includes('bg-purple') ||
    className.includes('bg-amber');

  return {
    calendar_date: isoDate(month, day),
    title,
    saints: [],
    feast_rank: isRed ? 'cruce roșie' : 'cruce neagră',
    fasting_note: fastingNote,
    details: decodeHtml(label),
    editorial_source: `${SOURCE_LABEL}, ${SOURCE_URL}`,
  };
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
      `Invalid GE calendar: rows=${entries.length}, unique=${unique.size}, missing=${missing.join(',')}, duplicates=${duplicates.join(',')}`,
    );
  }
  if (dates[0] !== '2026-01-01' || dates.at(-1) !== '2026-12-31') {
    throw new Error(`Invalid GE date range: ${dates[0]} to ${dates.at(-1)}`);
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

-- Georgian Orthodox Church calendar 2026.
-- Primary official source checked: https://patriarchate.ge/api/layouts/calendar/YYYY-MM-DD (incomplete 2026 coverage).
-- Complete Georgian source used: ${SOURCE_URL}

delete from public.calendar_day_translations t
using public.calendar_days d
where t.calendar_day_id = d.id
  and d.country_code = 'GE'
  and d.calendar_code = '${CALENDAR_CODE}'
  and d.calendar_date between date '2026-01-01' and date '2026-12-31';

delete from public.calendar_days
where country_code = 'GE'
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
    .map((entry) => {
      const title = englishTitle(entry.title);
      const details = englishTitle(entry.details);
      const fasting = translateFasting(entry.fasting_note);
      return `(date ${sql(entry.calendar_date)},${sql(title)},${sql(details)},${sql(fasting)})`;
    })
    .join(',\n');

  return `begin;

do $$
declare
  native_count integer;
begin
  select count(*)
    into native_count
  from public.calendar_days
  where country_code = 'GE'
    and calendar_code = '${CALENDAR_CODE}'
    and language_code = 'ka'
    and calendar_date between date '2026-01-01' and date '2026-12-31';

  if native_count <> 365 then
    raise exception 'Expected 365 native GE rows; found %', native_count;
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
  on d.country_code = 'GE'
 and d.calendar_code = '${CALENDAR_CODE}'
 and d.language_code = 'ka'
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
  where d.country_code = 'GE'
    and d.calendar_code = '${CALENDAR_CODE}'
    and d.language_code = 'ka'
    and d.calendar_date between date '2026-01-01' and date '2026-12-31'
    and t.language_code = 'en';

  if translated_count <> 365 then
    raise exception 'Expected 365 English GE translations; found %', translated_count;
  end if;
end
$$;

commit;
`;
}

const response = await fetch(SOURCE_URL);
if (!response.ok) {
  throw new Error(`Failed to fetch ${SOURCE_URL}: ${response.status}`);
}

const html = await response.text();
const entryPattern =
  /<a aria-label="([^"]+)"[^>]+href="\/ka\/kalendari\/mtskheturi-g-mtatsmindelis\/2026\/(\d+)\/(\d+)"[\s\S]*?<span class="([^"]+)"/g;

const entries = [];
let match;
while ((match = entryPattern.exec(html))) {
  entries.push(parseEntry(match[1], Number(match[2]), Number(match[3]), match[4]));
}

entries.sort((a, b) => a.calendar_date.localeCompare(b.calendar_date));
validate(entries);

await fs.writeFile(dataPath, `${JSON.stringify(entries, null, 2)}\n`);
await fs.writeFile(nativeMigrationPath, nativeMigration(entries));
await fs.writeFile(enMigrationPath, translationMigration(entries));

const redCount = entries.filter((entry) => entry.feast_rank === 'cruce roșie').length;
console.log(`Generated GE calendar: ${entries.length} rows, ${redCount} red-cross days`);
console.log(dataPath);
console.log(nativeMigrationPath);
console.log(enMigrationPath);
