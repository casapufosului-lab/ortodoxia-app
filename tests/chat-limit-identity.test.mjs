import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLimitIdentity, normalizeAddress, normalizeDevice } from '../supabase/functions/orthodox-chat/limit-identity.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const fn = readFileSync(join(root, 'supabase/functions/orthodox-chat/index.ts'), 'utf8');

// ─── C13: cerere fără adresă de client nu consumă bugetul comun ────────────────────────────────

test('C13: fără adresă de client, cheia de IP cade pe dispozitiv — nu pe un bucket comun', () => {
  const a = buildLimitIdentity(null, 'device-aaaaaaaa');
  const b = buildLimitIdentity(null, 'device-bbbbbbbb');
  assert.ok(a && b);
  assert.notEqual(a.ip, b.ip, 'două dispozitive fără adresă trebuie să aibă contoare diferite');
  assert.equal(a.ip, 'dev:device-aaaaaaaa');
  assert.equal(b.ip, 'dev:device-bbbbbbbb');
  assert.ok(!a.ip.includes('unknown') && !b.ip.includes('unknown'));
});

test('C13: 100 de dispozitive fără adresă dau 100 de chei distincte (niciun buget partajat)', () => {
  const keys = new Set();
  for (let i = 0; i < 100; i += 1) {
    const identity = buildLimitIdentity(null, `device-${i.toString().padStart(8, '0')}`);
    keys.add(identity.ip);
  }
  assert.equal(keys.size, 100);
});

test('C13: nicio combinație de semnale prezente nu produce bucketul comun „unknown"', () => {
  const cases = [
    [null, null],
    ['203.0.113.7', null],
    [null, 'device-cccccccc'],
    ['203.0.113.7', 'device-cccccccc'],
  ];
  for (const [address, device] of cases) {
    const identity = buildLimitIdentity(address, device);
    if (!identity) continue;
    assert.ok(!identity.ip.includes('unknown'), `${address}/${device} -> ${identity.ip}`);
    assert.ok(!identity.client.includes('unknown'), `${address}/${device} -> ${identity.client}`);
  }
});

test('C13: fără adresă ȘI fără dispozitiv → null (handlerul refuză, fail-closed)', () => {
  assert.equal(buildLimitIdentity(null, null), null);
});

test('adresă prezentă: cheia de IP rămâne pe adresă, identitatea de client se separă pe dispozitiv', () => {
  const one = buildLimitIdentity('198.51.100.4', 'device-11111111');
  const two = buildLimitIdentity('198.51.100.4', 'device-22222222');
  assert.ok(one && two);
  assert.equal(one.ip, 'addr:198.51.100.4');
  assert.equal(one.ip, two.ip, 'aceeași rețea = același contor de IP');
  assert.notEqual(one.client, two.client, 'dispozitive diferite = contoare de client diferite');
});

test('normalizeAddress: primul candidat valid, curățat, plafonat la 64 de caractere', () => {
  assert.equal(normalizeAddress([' 203.0.113.9 , 70.41.3.18', '10.0.0.1']), '203.0.113.9');
  assert.equal(normalizeAddress([null, '', '  10.0.0.1 ']), '10.0.0.1');
  assert.equal(normalizeAddress([null, undefined, '']), null);
  assert.equal(normalizeAddress(['x'.repeat(65)]), null, 'o valoare absurdă nu devine cheie');
});

test('normalizeDevice: doar forma acceptată (8-64, [a-z0-9._-])', () => {
  assert.equal(normalizeDevice('  3F7C0E4A-AAAA-BBBB  '), '3f7c0e4a-aaaa-bbbb');
  assert.equal(normalizeDevice('short'), null);
  assert.equal(normalizeDevice('bad chars here'), null);
  assert.equal(normalizeDevice('x'.repeat(65)), null);
  assert.equal(normalizeDevice(null), null);
});

// ─── Cablajul în funcția edge ──────────────────────────────────────────────────────────────────

test('index.ts construiește identitatea prin modulul testabil, nu cu valoarea de rezervă comună', () => {
  assert.ok(fn.includes("from './limit-identity.ts'"), 'trebuie să importe modulul de identitate');
  assert.ok(fn.includes('buildLimitIdentity('), 'trebuie să folosească buildLimitIdentity');
  assert.ok(!/return raw\.length > 0 && raw\.length <= 64 \? raw : 'unknown'/.test(fn), 'vechiul fallback comun a fost scos');
});

test('index.ts refuză cererea neidentificabilă înainte de a consuma bugetul', () => {
  const guard = fn.indexOf('if (!identity)');
  const reservation = fn.indexOf("rpc('reserve_ai_request'");
  assert.ok(guard !== -1, 'lipsește verificarea de identitate');
  assert.ok(guard < reservation, 'verificarea de identitate trebuie să fie înaintea rezervării din SQL');
  assert.ok(fn.includes("code: 'client_unidentified'"));
  assert.ok(fn.includes('}, 400)'), 'refuzul e un 400 explicit');
});

test('cheile trimise la SQL sunt hash-uite cu sarea serverului (niciun semnal brut)', () => {
  assert.ok(fn.includes('sha256Hex(`${limitSalt}|device|${identity.client}`)'));
  assert.ok(fn.includes('sha256Hex(`${limitSalt}|ip|${identity.ip}`)'));
});
