/**
 * C16 (registru, mediu) — secretele din headerele functiilor Edge se compara in timp constant.
 *
 * DE CE
 * -----
 * `send-daily-notifications/index.ts` compara `x-cron-secret` cu `!==`, iar
 * `generate-prayer-audio/index.ts` compara `x-generation-token` cu `!==`. `!==` iese din
 * comparatie la primul caracter diferit, deci durata raspunsului depinde de cate caractere
 * din prefix se potrivesc. Un client care cronometreaza poate reconstrui secretul caracter
 * cu caracter. Ambele ramaneau fail-closed (401), dar timing-ul nu era inchis.
 *
 * `supabase/functions/_shared/http.ts` exporta deja `timingSafeEqual`, iar comentariul lui
 * de la inceput promitea ca endpointurile de cron si de audio au aceeasi garantie — promisiune
 * care nu era adevarata in cod pana la acest fix.
 *
 * CE VERIFICA TESTUL
 * ------------------
 *  1. comportamentul real al functiei `timingSafeEqual` (importata din modulul real, nu copiata);
 *  2. ca functia CHIAR nu iese devreme la un caracter diferit (`auditConstantTime` pica pe o
 *     varianta mutata care returneaza la primul caracter diferit);
 *  3. ca cele doua locuri de apel trec headerul prin `timingSafeEqual` (`auditSecretHeader`
 *     pica pe forma veche, cu `!==`);
 *  4. o baltaie pe TOATE sursele functiilor: niciun secret citit cu `Deno.env.get(...)` nu are
 *     voie sa fie comparat cu `===`/`!==` langa un header citit cu `headers.get(...)`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { timingSafeEqual } from '../supabase/functions/_shared/http.ts';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const FUNCTIONS_DIR = join(REPO, 'supabase', 'functions');
const read = (relPath) => readFileSync(join(REPO, relPath), 'utf8');

const SHARED_HTTP = 'supabase/functions/_shared/http.ts';
const DAILY_NOTIFICATIONS = 'supabase/functions/send-daily-notifications/index.ts';
const PRAYER_AUDIO = 'supabase/functions/generate-prayer-audio/index.ts';

/**
 * Verifica implementarea unei comparatii in timp constant. Returneaza lista de probleme
 * (goala = implementarea e corecta). Separata de test ca sa poata fi hranita si cu o
 * varianta mutata: daca auditorul nu poate pica, nu apara nimic.
 */
function auditConstantTime(source) {
  const problems = [];
  if (!/difference\s*\|=/.test(source)) {
    problems.push('nu acumuleaza diferentele intr-o singura valoare (lipseste `difference |= ...`)');
  }
  if (/return\s+a\s*[=!]==\s*b\b/.test(source)) {
    problems.push('comparatie directa `a === b` / `a !== b`');
  }
  if (/a\.(?:startsWith|indexOf|localeCompare)\(/.test(source)) {
    problems.push('scurtatura de prefix (startsWith/indexOf/localeCompare)');
  }
  if (!/a\.length\s*!==\s*b\.length/.test(source)) {
    problems.push('lipseste verificarea de lungime inainte de bucla');
  }
  const loop = source.match(/for\s*\([^)]*\)\s*\{[\s\S]*?\n\s*\}/);
  if (!loop) {
    problems.push('nu exista o bucla de acumulare');
  } else if (/\breturn\b/.test(loop[0])) {
    problems.push('bucla iese la primul caracter diferit, deci durata depinde de prefix');
  }
  return problems;
}

/**
 * Verifica un loc de apel: headerul dat trebuie sa ajunga in `timingSafeEqual`, iar in
 * vecinatatea citirii lui nu are voie sa apara o comparatie cu `===`/`!==`.
 * Fereastra de 3 linii acopera si forma `const x = req.headers.get(...)` urmata de `if`.
 */
function auditSecretHeader(source, header) {
  const problems = [];
  const lines = source.split(/\r?\n/);
  const importBlock = source.match(/import\s*\{[\s\S]*?\}\s*from\s*'\.\.\/_shared\/http\.ts'/);
  if (!importBlock || !/\btimingSafeEqual\b/.test(importBlock[0])) {
    problems.push('nu importa `timingSafeEqual` din `../_shared/http.ts`');
  }

  let reads = 0;
  lines.forEach((line, index) => {
    if (!line.includes(`headers.get('${header}')`)) return;
    reads += 1;
    const window = lines.slice(index, index + 3).join('\n');
    if (!/timingSafeEqual\(/.test(window)) {
      problems.push(`linia ${index + 1}: headerul ${header} nu este comparat prin timingSafeEqual`);
    } else if (/[=!]==/.test(window.replace(/timingSafeEqual\([^;]*/, ''))) {
      problems.push(`linia ${index + 1}: headerul ${header} este comparat si cu ===/!==`);
    }
  });
  if (reads === 0) problems.push(`headerul ${header} nu mai este citit (a fost redenumit?)`);
  return problems;
}

/** Toate fisierele .ts din supabase/functions, relativ la repo. */
function functionSources() {
  const found = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name);
      if (statSync(abs).isDirectory()) { walk(abs); continue; }
      if (name.endsWith('.ts')) found.push(relative(REPO, abs).split(sep).join('/'));
    }
  };
  walk(FUNCTIONS_DIR);
  return found;
}

test('C16: timingSafeEqual se comporta corect (egal, diferit, prefix, lipsa)', () => {
  assert.equal(timingSafeEqual('acelasi-secret', 'acelasi-secret'), true);
  // Aici `!==` raspundea repede pentru primele caractere, apoi incet: exact semnalul de timing.
  assert.equal(timingSafeEqual('aaaaaaaa-secret', 'aaaaaaaa-secreu'), false);
  assert.equal(timingSafeEqual('secret', 'secret-mai-lung'), false);
  assert.equal(timingSafeEqual('secre', 'secret'), false);
  assert.equal(timingSafeEqual('', ''), true);
  assert.equal(timingSafeEqual(null, 'secret'), false);
  assert.equal(timingSafeEqual('secret', null), false);
  assert.equal(timingSafeEqual(undefined, undefined), false);
  assert.equal(timingSafeEqual('x'.repeat(512), `${'x'.repeat(511)}y`), false);
});

test('C16: auditorul de timp constant accepta implementarea reala si pica pe cea mutata', () => {
  const real = read(SHARED_HTTP);
  assert.deepEqual(auditConstantTime(real), []);

  // Mutatie: exact forma pe care fixul o elimina — iese la primul caracter diferit.
  const mutated = real
    .replace('let difference = 0;', '')
    .replace('difference |= a.charCodeAt(index) ^ b.charCodeAt(index);',
      'if (a.charCodeAt(index) !== b.charCodeAt(index)) return false;')
    .replace('return difference === 0;', 'return true;');
  assert.notEqual(mutated, real, 'mutatia nu s-a aplicat — testul nu ar putea pica');
  const problems = auditConstantTime(mutated);
  assert.ok(problems.length > 0, 'auditorul trebuie sa respinga o comparatie care iese la primul caracter diferit');

  // A doua mutatie: scurtatura cu `a === b`.
  const shortcut = real.replace('let difference = 0;', 'return a === b;\n  let difference = 0;');
  assert.ok(auditConstantTime(shortcut).length > 0, 'auditorul trebuie sa respinga `a === b`');
});

test('C16: send-daily-notifications compara x-cron-secret prin timingSafeEqual', () => {
  const source = read(DAILY_NOTIFICATIONS);
  assert.deepEqual(auditSecretHeader(source, 'x-cron-secret'), []);
  assert.ok(
    source.includes("timingSafeEqual(req.headers.get('x-cron-secret'), cronSecret)"),
    'comparatia reala trebuie sa fie vizibila in sursa',
  );
});

test('C16: generate-prayer-audio compara x-generation-token prin timingSafeEqual', () => {
  const source = read(PRAYER_AUDIO);
  assert.deepEqual(auditSecretHeader(source, 'x-generation-token'), []);
  assert.ok(
    source.includes('timingSafeEqual(requestToken, generationToken)'),
    'comparatia reala trebuie sa fie vizibila in sursa',
  );
});

test('C16: auditorul de loc de apel pica pe formele vechi, cu !== ', () => {
  const oldDaily = [
    "import { corsHeaders as buildCorsHeaders, preflightResponse } from '../_shared/http.ts';",
    '  const cronSecret = Deno.env.get(NOTIFICATION_CRON_SECRET);',
    "  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {",
    "    return json({ error: 'Acces neautorizat.' }, 401);",
    '  }',
    '',
  ].join('\n');
  const oldAudio = [
    "import { corsHeaders as buildCorsHeaders, preflightResponse } from '../_shared/http.ts';",
    "  const generationToken = Deno.env.get('PRAYER_AUDIO_GENERATION_TOKEN');",
    "  const requestToken = req.headers.get('x-generation-token');",
    '  if (!generationToken || requestToken !== generationToken) {',
    "    return json({ error: 'Acces neautorizat.' }, 401);",
    '  }',
    '',
  ].join('\n');

  assert.ok(auditSecretHeader(oldDaily, 'x-cron-secret').length >= 2, 'forma veche (import fara ajutor + !==) trebuie respinsa');
  assert.ok(auditSecretHeader(oldAudio, 'x-generation-token').length >= 2, 'forma veche (import fara ajutor + !==) trebuie respinsa');
  // Ordinea conteaza: auditorul vechi nu are voie sa treaca nici macar cand importul e corect.
  assert.ok(
    auditSecretHeader(oldAudio.replace(
      "import { corsHeaders as buildCorsHeaders, preflightResponse } from '../_shared/http.ts';",
      "import { corsHeaders as buildCorsHeaders, preflightResponse, timingSafeEqual } from '../_shared/http.ts';",
    ), 'x-generation-token').length >= 1,
    'chiar si cu importul corect, comparatia cu !== trebuie respinsa',
  );
});

test('C16: niciun secret din Deno.env.get nu e comparat cu ===/!== langa un header', () => {
  const offenders = [];
  for (const relPath of functionSources()) {
    const source = read(relPath);
    const secrets = new Set(
      [...source.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*Deno\.env\.get\(/g)].map((match) => match[1]),
    );
    if (secrets.size === 0) continue;
    const lines = source.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (!/[=!]==/.test(line)) return;
      const window = lines.slice(Math.max(0, index - 3), index + 2).join('\n');
      if (!/headers\.get\(['"]x-/.test(window)) return;
      if (/timingSafeEqual\(|authorizeRequest\(/.test(window)) return;
      const touchesSecret = [...secrets].some((name) => new RegExp(`\\b${name}\\b`).test(line));
      if (touchesSecret) offenders.push(`${relPath}:${index + 1}: ${line.trim().slice(0, 120)}`);
    });
  }
  assert.deepEqual(offenders, [], 'secrete comparate in timp variabil');
});
