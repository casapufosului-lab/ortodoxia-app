import { writeFileSync } from 'node:fs';

const YEAR = 2026;
const SOURCE = 'Azbyka Orthodox Church Calendar 2026, https://azbyka.ru/days/';

function decodeHtml(value) {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripTags(value) {
  return decodeHtml(value.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function transliterateRu(value) {
  const map = {
    А: 'A', а: 'a', Б: 'B', б: 'b', В: 'V', в: 'v', Г: 'G', г: 'g',
    Д: 'D', д: 'd', Е: 'E', е: 'e', Ё: 'Yo', ё: 'yo', Ж: 'Zh', ж: 'zh',
    З: 'Z', з: 'z', И: 'I', и: 'i', Й: 'y', й: 'y', К: 'K', к: 'k',
    Л: 'L', л: 'l', М: 'M', м: 'm', Н: 'N', н: 'n', О: 'O', о: 'o',
    П: 'P', п: 'p', Р: 'R', р: 'r', С: 'S', с: 's', Т: 'T', т: 't',
    У: 'U', у: 'u', Ф: 'F', ф: 'f', Х: 'Kh', х: 'kh', Ц: 'Ts', ц: 'ts',
    Ч: 'Ch', ч: 'ch', Ш: 'Sh', ш: 'sh', Щ: 'Shch', щ: 'shch',
    Ъ: '', ъ: '', Ы: 'Y', ы: 'y', Ь: '', ь: '', Э: 'E', э: 'e',
    Ю: 'Yu', ю: 'yu', Я: 'Ya', я: 'ya', І: 'I', і: 'i',
  };
  return [...value].map((char) => map[char] ?? char).join('');
}

function englishTitle(ruTitle) {
  const replacements = [
    [/Рождество Господа Бога и Спаса нашего Иисуса Христа/g, 'Nativity of Our Lord God and Savior Jesus Christ'],
    [/Богоявление|Крещение Господне/g, 'Holy Theophany'],
    [/Сретение Господне/g, 'Meeting of the Lord'],
    [/Благовещение Пресвятой Богородицы/g, 'Annunciation of the Most Holy Theotokos'],
    [/Вход Господень в Иерусалим/g, 'Entry of the Lord into Jerusalem'],
    [/Вознесение Господне/g, 'Ascension of the Lord'],
    [/День Святой Троицы|Пятидесятница/g, 'Holy Pentecost'],
    [/Преображение Господне/g, 'Transfiguration of the Lord'],
    [/Успение Пресвятой Богородицы/g, 'Dormition of the Most Holy Theotokos'],
    [/Рождество Пресвятой Богородицы/g, 'Nativity of the Most Holy Theotokos'],
    [/Воздвижение Честного и Животворящего Креста Господня/g, 'Exaltation of the Precious and Life-giving Cross of the Lord'],
    [/Введение во храм Пресвятой Богородицы/g, 'Entrance of the Most Holy Theotokos into the Temple'],
    [/Покров Пресвятой Богородицы/g, 'Protection of the Most Holy Theotokos'],
    [/Обрезание Господне/g, 'Circumcision of the Lord'],
    [/Собор Пресвятой Богородицы/g, 'Synaxis of the Most Holy Theotokos'],
    [/Собор Архистратига Михаила/g, 'Synaxis of the Archangel Michael'],
    [/Усекновение главы Пророка, Предтечи и Крестителя Господня Иоанна/g, 'Beheading of the Holy Prophet, Forerunner and Baptist John'],
    [/Святителя Николая/g, 'Saint Nicholas'],
    [/Пресвятой Богородицы/g, 'Most Holy Theotokos'],
    [/Господ[аняе]* /g, 'of the Lord '],
    [/свт\./g, 'Saint Hierarch'],
    [/сщмч\./g, 'Hieromartyr'],
    [/вмч\./g, 'Great Martyr'],
    [/мч\./g, 'Martyr'],
    [/прп\./g, 'Venerable'],
    [/прав\./g, 'Righteous'],
    [/ап\./g, 'Apostle'],
    [/прор\./g, 'Prophet'],
    [/исп\./g, 'Confessor'],
    [/равноап\./g, 'Equal-to-the-Apostles'],
    [/блгв\./g, 'Right-believing'],
    [/иконы Божией Матери/g, 'Icon of the Mother of God'],
    [/Неделя/g, 'Sunday'],
    [/Седмица/g, 'Week'],
    [/по Пятидесятнице/g, 'after Pentecost'],
    [/Поста нет/g, 'No fast'],
    [/Постный день/g, 'Fast day'],
  ];
  let value = ruTitle;
  for (const [from, to] of replacements) value = value.replace(from, to);
  return transliterateRu(value).replace(/\s+/g, ' ').trim();
}

function extractMeta(html) {
  const match = html.match(/<meta name="description" content="([^"]+)"/);
  return match ? decodeHtml(match[1]) : '';
}

function extractDayText(html) {
  const match = html.match(/<div class="text day__text">([\s\S]*?)<\/div>\s*<\/div>/);
  if (!match) return { fasting: null, items: [], red: false };

  const block = match[1];
  const paragraph = block.match(/<p>([\s\S]*?)<\/p>/);
  const fasting = paragraph ? stripTags(paragraph[1]) : null;
  const items = [...block.matchAll(/<li class="([^"]+)">([\s\S]*?)<\/li>/g)].map((m) => ({
    className: m[1],
    text: stripTags(m[2]),
  })).filter((item) => item.text.length > 0);

  return {
    fasting,
    items,
    red: items.some((item) => item.className.includes('ideograph-1')),
  };
}

const rows = [];
for (let date = new Date(Date.UTC(YEAR, 0, 1)); date.getUTCFullYear() === YEAR; date = addDays(date, 1)) {
  const key = dateKey(date);
  const response = await fetch(`https://azbyka.ru/days/${key}`);
  if (!response.ok) throw new Error(`Fetch failed ${key}: ${response.status}`);
  const html = await response.text();
  const meta = extractMeta(html);
  const day = extractDayText(html);
  const metaParts = meta.split(' - ');
  const titleParts = day.items.length ? day.items.map((item) => item.text) : [metaParts.slice(1).join(' - ') || 'День православного календаря'];
  const title = titleParts.join('; ');
  const isSunday = /воскресенье|Неделя/.test(meta);
  const feastRank = day.red ? 'cruce roșie' : (isSunday || day.items.length ? 'cruce neagră' : null);

  rows.push({
    calendar_date: key,
    title,
    saints: [],
    feast_rank: feastRank,
    fasting_note: day.fasting,
    details: meta,
    editorial_source: SOURCE,
    english_title: englishTitle(title),
    english_details: meta ? englishTitle(meta) : null,
    english_fasting_note: day.fasting ? englishTitle(day.fasting) : null,
  });
}

writeFileSync('src/data/ru-calendar-2026.json', `${JSON.stringify(rows, null, 2)}\n`);
console.log(JSON.stringify({
  rows: rows.length,
  unique: new Set(rows.map((row) => row.calendar_date)).size,
  first: rows[0]?.calendar_date,
  last: rows.at(-1)?.calendar_date,
  red: rows.filter((row) => row.feast_rank === 'cruce roșie').length,
}, null, 2));
