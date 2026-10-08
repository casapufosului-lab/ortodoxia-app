/**
 * C17 — CORS-ul fiecărei funcții edge trebuie construit din cererea curentă, nu dintr-o
 * variabilă la nivel de modul.
 *
 * Defectul real (măsurat în cod pe 08.10.2026): fiecare funcție ținea cererea într-un
 * `let activeRequest` la nivel de modul și o citea înapoi în `json()`. Într-un isolate, a
 * doua cerere poate porni cât timp prima așteaptă baza de date, deci răspunsul primei
 * cereri putea primi `Origin`-ul celei de-a doua — iar `Vary: Origin` nu ajută, fiindcă
 * valoarea greșită era deja emisă.
 *
 * Testele de mai jos: (1) hrănesc exact acea intercalare în implementarea nouă, (2) o
 * reproduc pe cea veche ca mutantă, ca să se vadă că detectorul POATE pica, (3) scanează
 * sursele, ca forma veche să nu poată reveni.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createJsonResponder, corsHeaders } from '../supabase/functions/_shared/http.ts';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const FUNCTIONS_DIR = join(REPO, 'supabase', 'functions');
const ORIGIN_A = 'https://a.example';
const ORIGIN_B = 'https://b.example';

function read(relPath) {
  return readFileSync(join(REPO, relPath), 'utf8');
}

/** Toate fișierele .ts din supabase/functions, relative la repo. */
function functionSources() {
  const found = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name);
      if (statSync(abs).isDirectory()) {
        walk(abs);
        continue;
      }
      if (name.endsWith('.ts')) found.push(relative(REPO, abs).split(sep).join('/'));
    }
  };
  walk(FUNCTIONS_DIR);
  return found.sort();
}

/**
 * Auditorul de formă: primește sursa unui fișier și întoarce lista de probleme
 * (goală = CORS-ul e legat de cerere). Separat de test ca să poată fi hrănit și cu
 * forma veche — dacă auditorul nu poate pica, nu apără nimic.
 */
function auditPerRequestCors(relPath, source) {
  const problems = [];
  if (/^let activeRequest\b/m.test(source)) {
    problems.push('ține cererea într-o variabilă de modul (`let activeRequest`)');
  }
  if (/^function json\(/m.test(source)) {
    problems.push('`json()` la nivel de modul: poate citi cererea altei cereri');
  }
  if (relPath.endsWith('/index.ts')) {
    if (!/const json = createJsonResponder\(req, ALLOWED_HEADERS\)/.test(source)) {
      problems.push('nu construiește respondentul din `req`, în handler');
    }
    if (!/import\s*\{[\s\S]*?\bcreateJsonResponder\b[\s\S]*?\}\s*from\s*'\.\.\/_shared\/http\.ts'/.test(source)) {
      problems.push('nu importă `createJsonResponder` din `../_shared/http.ts`');
    }
  }
  return problems;
}

/**
 * Instalează un `Deno.env` fals (helperul citește `ALLOWED_ORIGINS` la fiecare apel) și îl
 * scoate la final, ca testele să nu depindă una de alta. `await`-at, ca restaurarea să se
 * facă după ce callback-ul chiar s-a terminat.
 */
async function withAllowedOrigins(origins, run) {
  const previous = globalThis.Deno;
  globalThis.Deno = { env: { get: (key) => (key === 'ALLOWED_ORIGINS' ? origins : undefined) } };
  try {
    return await run();
  } finally {
    if (previous === undefined) delete globalThis.Deno;
    else globalThis.Deno = previous;
  }
}

test('C17: doi respondenți luați în același timp păstrează fiecare originea cererii lui', async () => {
  await withAllowedOrigins(`${ORIGIN_A},${ORIGIN_B}`, async () => {
    const requestA = new Request('https://functions.invalid/x', { headers: { origin: ORIGIN_A } });
    const requestB = new Request('https://functions.invalid/x', { headers: { origin: ORIGIN_B } });

    // Cererea A intră prima și rămâne în așteptare (await pe bază de date); între timp sosește B.
    const jsonA = createJsonResponder(requestA, 'content-type');
    await new Promise((resolve) => setTimeout(resolve, 5));
    const jsonB = createJsonResponder(requestB, 'content-type');

    const responseA = jsonA({ request: 'A' });
    const responseB = jsonB({ request: 'B' });

    assert.equal(
      responseA.headers.get('access-control-allow-origin'),
      ORIGIN_A,
      'răspunsul lui A trebuie să poarte originea lui A, nu a cererii sosite între timp',
    );
    assert.equal(responseB.headers.get('access-control-allow-origin'), ORIGIN_B);
    assert.equal(responseA.headers.get('vary'), 'Origin');
    assert.equal(responseA.headers.get('content-type'), 'application/json');
    assert.equal(responseA.status, 200);
  });
});

test('C17: forma veche (stare de modul) chiar scurge originea — deci testul poate pica', async () => {
  await withAllowedOrigins(`${ORIGIN_A},${ORIGIN_B}`, async () => {
    const requestA = new Request('https://functions.invalid/x', { headers: { origin: ORIGIN_A } });
    const requestB = new Request('https://functions.invalid/x', { headers: { origin: ORIGIN_B } });

    // Mutanta: exact forma eliminată de fix — `let activeRequest` + `json()` care îl citește.
    let activeRequest = null;
    const oldJson = (body, status = 200) => new Response(JSON.stringify(body), {
      status,
      headers: {
        ...(activeRequest ? corsHeaders(activeRequest, 'content-type') : {}),
        'Content-Type': 'application/json',
      },
    });

    activeRequest = requestA;
    await new Promise((resolve) => setTimeout(resolve, 5));
    activeRequest = requestB;

    const leaked = oldJson({ request: 'A' });
    assert.equal(
      leaked.headers.get('access-control-allow-origin'),
      ORIGIN_B,
      'mutanta trebuie să scurgă originea lui B în răspunsul lui A — altfel testul de mai sus nu apără nimic',
    );
    assert.notEqual(leaked.headers.get('access-control-allow-origin'), ORIGIN_A);
  });
});

test('C17: `extraHeaders` se adaugă peste antetele CORS, fără să le înlocuiască', async () => {
  await withAllowedOrigins(ORIGIN_A, async () => {
    const json = createJsonResponder(
      new Request('https://functions.invalid/x', { headers: { origin: ORIGIN_A } }),
      'content-type',
    );
    const response = json({ ok: true }, 200, { 'Cache-Control': 'no-store' });
    assert.equal(response.headers.get('access-control-allow-origin'), ORIGIN_A);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.status, 200);
  });
});

test('C17: nicio funcție edge nu mai ține cererea într-o variabilă de modul', () => {
  const offenders = [];
  const sources = functionSources();
  assert.ok(sources.length >= 15, 'scanarea trebuie să vadă fișierele funcțiilor');

  for (const relPath of sources) {
    for (const problem of auditPerRequestCors(relPath, read(relPath))) {
      offenders.push(`${relPath}: ${problem}`);
    }
  }
  assert.deepEqual(offenders, [], 'CEREREA NU ARE VOIE SĂ STEA LA NIVEL DE MODUL');
});

test('C17: auditorul de formă respinge sursa de dinainte de fix', () => {
  const current = read('supabase/functions/delete-account/index.ts');
  assert.deepEqual(auditPerRequestCors('supabase/functions/delete-account/index.ts', current), []);

  // Mutanta 1: se readuce `let activeRequest` + `json()` la nivel de modul.
  const mutated = current
    .replace('const ALLOWED_HEADERS', 'let activeRequest: Request | null = null;\n\nfunction json(body: Record<string, unknown>, status = 200) {\n  return new Response(JSON.stringify(body), { status });\n}\n\nconst ALLOWED_HEADERS')
    .replace('const json = createJsonResponder(req, ALLOWED_HEADERS);', 'activeRequest = req;');
  assert.notEqual(mutated, current, 'mutatia nu s-a aplicat — testul nu ar putea pica');
  const problems = auditPerRequestCors('supabase/functions/delete-account/index.ts', mutated);
  assert.ok(problems.length >= 3, `auditorul trebuie să respingă forma veche, a găsit: ${problems.join('; ')}`);

  // Mutanta 2: respondentul e construit, dar din altă cerere decât cea primită.
  const offRequest = current.replace(
    'const json = createJsonResponder(req, ALLOWED_HEADERS);',
    "const json = createJsonResponder(new Request('https://alt.example'), ALLOWED_HEADERS);",
  );
  assert.notEqual(offRequest, current);
  assert.ok(auditPerRequestCors('supabase/functions/delete-account/index.ts', offRequest).length > 0);
});
