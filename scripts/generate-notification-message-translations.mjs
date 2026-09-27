import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const sourceMigration = join(root, 'supabase/migrations/20260913120000_seed_ro_daily_notification_message_bank.sql');
const outputDir = join(root, 'work/notification_message_translations');

const targets = {
  en: 'English',
  el: 'Greek',
  sr: 'Serbian',
  bg: 'Bulgarian',
  mk: 'Macedonian',
  uk: 'Ukrainian',
  ka: 'Georgian',
  ru: 'Russian',
  sq: 'Albanian',
};

// Citirea se face static (process.env.NUME la locul apelului), nu dinamic cu process.env[name]:
// regulile Expo cer acces static la variabilele de mediu, iar așa variabilele se și văd în cod.
function envNumber(raw, name, fallback) {
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
  return value;
}

function unescapeSql(value) {
  return value.replace(/''/g, "'");
}

function sql(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function parseTuple(line) {
  const values = [];
  let current = '';
  let inString = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === "'" && inString && next === "'") {
      current += "'";
      index += 1;
      continue;
    }
    if (char === "'") {
      inString = !inString;
      continue;
    }
    if (char === ',' && !inString) {
      values.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  values.push(current.trim());
  return values.map(unescapeSql);
}

function readRomanianMessages() {
  const migration = readFileSync(sourceMigration, 'utf8');
  const rows = [];
  for (const line of migration.split(/\r?\n/)) {
    const trimmed = line.trim().replace(/,$/, '');
    if (!trimmed.startsWith("('ro', null, null,")) continue;
    const inside = trimmed.slice(1, -1);
    const [language_code, country_code, calendar_code, day_type, theme, title_template, body_template] = parseTuple(inside);
    rows.push({
      message_code: `ro_${theme}`,
      language_code,
      country_code,
      calendar_code,
      day_type,
      theme,
      title_template,
      body_template,
    });
  }
  if (rows.length !== 370) throw new Error(`Expected 370 Romanian notification messages, found ${rows.length}`);
  return rows;
}

function validateTranslation(source, translated, languageCode) {
  const errors = [];
  if (translated.message_code !== source.message_code) errors.push('message_code_changed');
  if (translated.day_type !== source.day_type) errors.push('day_type_changed');
  if (translated.theme !== source.theme) errors.push('theme_changed');
  if (translated.language_code !== languageCode) errors.push('language_code_invalid');
  if (!translated.title_template || typeof translated.title_template !== 'string') errors.push('missing_title');
  if (!translated.body_template || typeof translated.body_template !== 'string') errors.push('missing_body');
  for (const placeholder of source.body_template.match(/\{[a-z_]+\}/g) ?? []) {
    if (!translated.body_template.includes(placeholder)) errors.push(`missing_placeholder_${placeholder}`);
  }
  return errors;
}

function buildPrompt(jobs, languageCode) {
  return [
    `Translate these Romanian Orthodox daily notification messages into ${targets[languageCode]}.`,
    'Return ONLY valid JSON array, no markdown.',
    'Preserve message_code, day_type, theme exactly.',
    `Set language_code exactly to "${languageCode}".`,
    'Translate title_template and body_template only.',
    'Keep all placeholders exactly as-is, including {feast_title} and {fasting_note}.',
    'Use a warm Orthodox tone, simple wording, no politics, no superstition, no marketing slang.',
    'Do not add Bible references.',
    JSON.stringify(jobs, null, 2),
  ].join('\n');
}

function extractJsonArray(text) {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end < start) throw new Error('No JSON array found in model output');
  return JSON.parse(text.slice(start, end + 1));
}

async function callOpenRouter(jobs, languageCode) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is missing');
  const model = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://ortodoxia.app',
      'X-Title': 'Ortodoxia Notification Message Localization',
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: 'You are a careful Orthodox localization editor.' },
        { role: 'user', content: buildPrompt(jobs, languageCode) },
      ],
    }),
  });
  if (!response.ok) throw new Error(`OpenRouter ${response.status}: ${await response.text()}`);
  const payload = await response.json();
  return extractJsonArray(payload.choices?.[0]?.message?.content ?? '');
}

async function generate() {
  const languageCode = process.env.TARGET_LANGUAGE;
  if (!targets[languageCode]) throw new Error(`TARGET_LANGUAGE must be one of: ${Object.keys(targets).join(', ')}`);

  const source = readRomanianMessages();
  const limit = envNumber(process.env.LIMIT, 'LIMIT', source.length);
  const offset = envNumber(process.env.OFFSET, 'OFFSET', 0);
  const groupSize = envNumber(process.env.REQUEST_GROUP_SIZE, 'REQUEST_GROUP_SIZE', 25);
  const slice = source.slice(offset, offset + limit);
  const results = [];

  for (let index = 0; index < slice.length; index += groupSize) {
    const group = slice.slice(index, index + groupSize);
    const requestJobs = group.map((item) => ({
      message_code: item.message_code,
      day_type: item.day_type,
      theme: item.theme,
      language_code: languageCode,
      title_template: item.title_template,
      body_template: item.body_template,
    }));
    const translated = await callOpenRouter(requestJobs, languageCode);
    for (const sourceItem of group) {
      const item = translated.find((candidate) => candidate.message_code === sourceItem.message_code) ?? {};
      const normalized = {
        message_code: sourceItem.message_code,
        day_type: sourceItem.day_type,
        theme: sourceItem.theme,
        language_code: languageCode,
        title_template: item.title_template ?? '',
        body_template: item.body_template ?? '',
      };
      results.push({
        ...normalized,
        validation_errors: validateTranslation(sourceItem, normalized, languageCode),
      });
    }
  }

  mkdirSync(outputDir, { recursive: true });
  const start = String(offset + 1).padStart(3, '0');
  const end = String(offset + results.length).padStart(3, '0');
  const output = join(outputDir, `${languageCode}_${start}_${end}.json`);
  writeFileSync(output, JSON.stringify(results, null, 2), 'utf8');
  console.log(JSON.stringify({
    mode: 'openrouter',
    target_language: languageCode,
    jobs: results.length,
    request_group_size: groupSize,
    output,
    items_with_errors: results.filter((item) => item.validation_errors.length > 0).length,
  }, null, 2));
}

function buildSql() {
  mkdirSync(outputDir, { recursive: true });
  const byCode = new Map();
  for (const file of readdirSync(outputDir).filter((name) => name.endsWith('.json')).sort()) {
    const items = JSON.parse(readFileSync(join(outputDir, file), 'utf8'));
    for (const item of items) byCode.set(`${item.language_code}:${item.message_code}`, item);
  }

  const items = [...byCode.values()].sort((a, b) => `${a.language_code}:${a.message_code}`.localeCompare(`${b.language_code}:${b.message_code}`));
  const counts = {};
  const bad = items.filter((item) => item.validation_errors?.length);
  for (const item of items) counts[item.language_code] = (counts[item.language_code] ?? 0) + 1;
  for (const languageCode of Object.keys(targets)) {
    if (counts[languageCode] !== 370) throw new Error(`${languageCode} has ${counts[languageCode] ?? 0} messages, expected 370`);
  }
  if (bad.length > 0) throw new Error(`${bad.length} translated messages still have validation errors`);

  const values = items.map((item) => (
    `  (${sql(item.language_code)}, null, null, ${sql(item.day_type)}, ${sql(item.theme)}, ${sql(item.title_template)}, ${sql(item.body_template)}, true)`
  ));

  const migration = `begin;\n\nupdate public.notification_messages\nset is_active = false\nwhere language_code in (${Object.keys(targets).map(sql).join(', ')})\n  and country_code is null\n  and calendar_code is null;\n\ninsert into public.notification_messages (\n  language_code,\n  country_code,\n  calendar_code,\n  day_type,\n  theme,\n  title_template,\n  body_template,\n  is_active\n) values\n${values.join(',\n')}\n;\n\ncommit;\n`;

  const output = join(root, 'supabase/migrations/20260913121000_seed_multilingual_daily_notification_message_bank.sql');
  writeFileSync(output, migration, 'utf8');
  console.log(JSON.stringify({ output, rows: items.length, counts }, null, 2));
}

const action = process.env.ACTION || 'generate';
if (action === 'generate') await generate();
else if (action === 'build-sql') buildSql();
else throw new Error('ACTION must be generate or build-sql');
