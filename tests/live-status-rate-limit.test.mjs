/**
 * B4 (audit de pre-lansare) — `live-services-status` era neautentificat, iar
 * „bugetul" se recrea la fiecare cerere, deci un apelant putea arde singur cota
 * YouTube zilnică (comentariul din status.ts pretindea contrariul).
 *
 * Testele de aici apără cele două limite care înlocuiesc acea iluzie:
 *   1. limitatorul per client (429 + Retry-After), care NU afectează alți clienți;
 *   2. bugetul de discovery scopat pe zi, nu pe cerere.
 * Ultimele teste verifică legarea în handler, ca reparația să nu poată fi scoasă
 * în tăcere (fără ea, fișierul de față pică).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

async function loadTs(relativePath) {
  const file = join(root, relativePath);
  try {
    return await import(pathToFileURL(file).href);
  } catch {
    // Fallback pentru un Node care nu șterge singur tipurile.
    const ts = (await import('typescript')).default;
    const js = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    return await import(`data:text/javascript;base64,${Buffer.from(js, 'utf8').toString('base64')}`);
  }
}

const limiterMod = await loadTs('supabase/functions/live-services-status/rate-limit.ts');
const statusMod = await loadTs('supabase/functions/live-services-status/status.ts');
const indexSource = readFileSync(join(root, 'supabase/functions/live-services-status/index.ts'), 'utf8');
const clientSource = readFileSync(join(root, 'src/live/live-status-client.ts'), 'utf8');

test('B4: limiter — peste plafon clientul primește 429, iar limita e raportată', () => {
  const limiter = limiterMod.createWindowRateLimiter(3, 60_000);
  const t0 = 1_700_000_000_000;
  for (let i = 1; i <= 3; i++) {
    const decision = limiter.check('1.2.3.4', t0 + i);
    assert.equal(decision.allowed, true, `cererea ${i} trebuia permisă`);
    assert.equal(decision.limit, 3);
  }
  const blocked = limiter.check('1.2.3.4', t0 + 4);
  assert.equal(blocked.allowed, false, 'a patra cerere trebuia refuzată');
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.retryAfterSeconds >= 1, 'Retry-After trebuie să fie cel puțin 1 secundă');
  assert.ok(blocked.retryAfterSeconds <= 60);
});

test('B4: un client limitat NU îi afectează pe ceilalți', () => {
  const limiter = limiterMod.createWindowRateLimiter(2, 60_000);
  const t0 = 1_700_000_000_000;
  limiter.check('10.0.0.1', t0);
  limiter.check('10.0.0.1', t0);
  assert.equal(limiter.check('10.0.0.1', t0).allowed, false);
  assert.equal(limiter.check('10.0.0.2', t0).allowed, true, 'alt client rămâne neafectat');
  assert.equal(limiter.check('10.0.0.3', t0).allowed, true);
});

test('B4: fereastra se resetează după expirare', () => {
  const limiter = limiterMod.createWindowRateLimiter(1, 60_000);
  const t0 = 1_700_000_000_000;
  assert.equal(limiter.check('9.9.9.9', t0).allowed, true);
  assert.equal(limiter.check('9.9.9.9', t0 + 1).allowed, false);
  assert.equal(limiter.check('9.9.9.9', t0 + 60_000).allowed, true, 'fereastra nouă permite din nou');
});

test('B4: memoria limitatorului e mărginită (clienți falși nu pot crește harta la infinit)', () => {
  const limiter = limiterMod.createWindowRateLimiter(5, 60_000, 10);
  const t0 = 1_700_000_000_000;
  for (let i = 0; i < 25; i++) limiter.check(`client-${i}`, t0 + i);
  assert.ok(limiter.trackedClients() <= 10, `urmăriți=${limiter.trackedClients()} trebuie ≤ 10`);
});

test('B4: adresa clientului e primul hop din x-forwarded-for, cu fallback pe antetele platformei', () => {
  const read = (headers) => limiterMod.clientAddress({ get: (name) => headers[name] ?? null });
  assert.equal(read({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }), '1.2.3.4');
  assert.equal(read({ 'x-forwarded-for': '  9.8.7.6  ' }), '9.8.7.6');
  assert.equal(read({ 'cf-connecting-ip': '5.5.5.5' }), '5.5.5.5');
  assert.equal(read({ 'x-real-ip': '6.6.6.6' }), '6.6.6.6');
  assert.equal(read({}), null, 'fără adresă => fără limitare per client (bugetul rămâne limita)');
});

test('B4: bugetul de discovery e scopat pe zi, nu recreat la fiecare cerere', () => {
  const holder = statusMod.createDayScopedDiscoveryBudget(5);
  const t0 = Date.UTC(2026, 9, 8, 10, 0, 0);
  const first = holder.forNow(t0);
  assert.equal(holder.dayKey(), '2026-10-08');
  assert.equal(first.remainingSearches, 5);

  first.remainingSearches -= 2; // două căutări consumate de prima cerere
  const second = holder.forNow(t0 + 30_000);
  assert.equal(second, first, 'a doua cerere din aceeași zi folosește ACELAȘI buget');
  assert.equal(second.remainingSearches, 3, 'consumul nu se resetează între cereri');

  const nextDay = holder.forNow(t0 + 24 * 60 * 60 * 1000);
  assert.notEqual(nextDay, first, 'ziua nouă primește un buget nou');
  assert.equal(nextDay.remainingSearches, 5);
  assert.equal(holder.dayKey(), '2026-10-09');
});

test('B4: sumarul bugetului e zilnic, nu „per invocare"', () => {
  const summary = statusMod.discoveryBudgetSummary(statusMod.createDiscoveryBudget(7));
  assert.equal(summary.maxSearchesPerDay, statusMod.DISCOVERY_MAX_SEARCHES_PER_DAY);
  assert.equal(summary.remainingSearches, 7);
  assert.ok(!('maxSearchesPerInvocation' in summary), 'vechea etichetă per-invocare a dispărut');
});

test('B4: handlerul chiar folosește limiterul și bugetul zilnic', () => {
  assert.ok(indexSource.includes('createWindowRateLimiter()'), 'limiterul e creat o dată, la nivel de modul');
  assert.ok(indexSource.includes('statusLimiter.check(client, nowMs)'), 'handlerul verifică limiterul');
  assert.ok(indexSource.includes('status_rate_limited'), 'refuzul are cod mașină-citibil');
  assert.ok(indexSource.includes("'Retry-After'"), 'refuzul spune când poate reveni clientul');
  assert.ok(/code: 'status_rate_limited',\s*\}\s*,\s*429/.test(indexSource), 'refuzul e 429');
  assert.ok(indexSource.includes('discoveryBudget.forNow(nowMs)'), 'bugetul vine din holderul zilnic');
  assert.ok(
    !indexSource.includes('const budget = createDiscoveryBudget()'),
    'bugetul nu mai e recreat în handler (bugul B4)',
  );
  assert.ok(
    !indexSource.includes('budget: discoveryBudgetSummary'),
    'bugetul nu se mai întoarce în răspunsul public',
  );
  assert.ok(indexSource.includes("console.log('live-status budget'"), 'rămâne în log, server-side');
});

test('B4: clientul nu mai declară câmpul budget în răspuns', () => {
  const raw = /export interface LiveStatusResponse \{[\s\S]*?\n\}/.exec(clientSource);
  assert.ok(raw, 'tipul LiveStatusResponse există');
  assert.ok(!raw[0].includes('budget'), 'tipul nu mai conține bugetul intern');
  assert.ok(raw[0].includes('sources'));
});
