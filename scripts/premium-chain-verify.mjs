#!/usr/bin/env node
/**
 * T2 (10.10.2026) — LANTUL COMPLET, CAP-COADA, CU NUMERE: poarta din baza + derivarea din aplicatie.
 *
 * Gaura care se masoara: „Premium activ + 5/zi" — ecranul citeste entitlement-ul RevenueCat, iar
 * poarta de acces (`reserve_ai_request`) citeste rândul din `public.subscriptions`. Cele doua surse
 * pot sa difere. Scriptul acesta dovedeste, cu numere, ca atunci cand amandoua sunt aliniate:
 *
 *   (A) poarta SQL da 50/zi pentru utilizatorul de test,
 *   (B) derivarea din APLICATIE (aceleasi functii pe care le foloseste ecranul) da 50/zi.
 *
 * CUM
 * ---
 * 1. Citeste secretele la rulare din `--env-file` (supabase.env); nimic hardcodat, nimic afisat.
 * 2. Salveaza rândul din `public.subscriptions` pentru utilizatorul de test (read-back inainte).
 * 3. Seteaza rândul: status='active', plan='annual', environment='sandbox', current_period_end=+30 zile.
 * 4. Cheama poarta SQL `reserve_ai_request` (RPC, aceeasi functie pe care o cheama serverul) si citeste
 *    `daily_limit`. ATENTIE: apelul CONSUMA o unitate din cota de test a acelui utilizator (usage_daily,
 *    contorul de dispozitiv/IP si bugetul lunar global); se noteaza in raport. Are si un „cooldown" de
 *    5 secunde, dar `daily_limit` se intoarce in toate ramurile, deci numaratoarea nu e afectata.
 * 5. Evalueaza derivarea din aplicatie FARA sa dubleze logica:
 *      - `isPremiumActive(customerInfo)` — functia REALA din `src/lib/revenuecat.ts`;
 *      - expresia REALA de mapare a limitei, citita din `src/hooks/use-subscription.ts`
 *        (`dailyAiLimit: isPremium ? PREMIUM_DAILY_AI_LIMIT : FREE_DAILY_AI_LIMIT`), evaluata cu
 *        constantele REALE din `src/lib/subscription.ts` si cu valoarea data de `isPremiumActive`.
 *    Modulele .ts sunt transpilate cu `typescript` si rulate intr-un `vm` cu `react-native`/
 *    `react-native-purchases` inlocuite — exact tiparul deja folosit de `tests/ai-limits.test.mjs`.
 * 6. Reseteaza rândul la starea de la pasul 2 si citeste inapoi (dovada). Resetarea ruleaza si daca
 *    apar erori (try/finally), ca rândul de test sa nu râmana modificat.
 * 7. Iese 0 DOAR daca ambele numere sunt 50 si rândul a revenit exact; altfel iese 1 si spune diferenta.
 *
 * OPTIUNI: --env-file=<cale> (obligatoriu) · --user-id=<uuid> · --json · --keep-row (NU reseteaza;
 * implicit reseteaza intotdeauna). Nu modifica nimic altundeva si nu scrie valori de chei.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

/** Utilizatorul de test din §0.3 (există în `auth.users`). */
const DEFAULT_USER_ID = '240db6ba-9cf8-4f91-a797-76b53b2c9690';
/** Consumatori de cota pentru apelul de test: doar siruri hexazecimale de 64 de caractere sunt acceptate. */
const TEST_CLIENT_HASH = 'a'.repeat(64);
const TEST_IP_HASH = 'b'.repeat(64);
/** Coloanele care descriu abonamentul; `updated_at` se afiseaza, dar nu intra in comparatia de resetare. */
const BUSINESS_COLUMNS = [
  'status',
  'plan',
  'provider',
  'environment',
  'current_period_end',
  'cancel_at_period_end',
  'provider_subscription_id',
  'revenuecat_snapshot_at_ms',
];
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseEnvFile(file) {
  const values = new Map();
  for (const rawLine of readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#') || !line.includes('=')) continue;
    const index = line.indexOf('=');
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values.set(line.slice(0, index).trim(), value);
  }
  return values;
}

function parseArgs(argv) {
  const args = { userId: DEFAULT_USER_ID, json: false, keepRow: false };
  for (const raw of argv) {
    if (raw === '--json') { args.json = true; continue; }
    if (raw === '--keep-row') { args.keepRow = true; continue; }
    const match = /^--([a-z-]+)=(.*)$/.exec(raw);
    if (match) args[match[1] === 'user-id' ? 'userId' : match[1]] = match[2];
  }
  return args;
}

/** Incarca un modul .ts al aplicatiei intr-un `vm`, cu modulele native inlocuite. */
function loadAppModule(relativePath, stubs = {}) {
  const filename = path.join(REPO_ROOT, relativePath);
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(
    compiled,
    {
      module,
      exports: module.exports,
      require: (name) => (name in stubs ? stubs[name] : {}),
      process: { env: {} },
      console,
      setTimeout,
      clearTimeout,
    },
    { filename },
  );
  return module.exports;
}

function restHeaders(serviceKey, extra = {}) {
  return { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', ...extra };
}

async function readRow({ baseUrl, serviceKey, userId }) {
  const response = await fetch(
    `${baseUrl}/rest/v1/subscriptions?user_id=eq.${userId}&select=*`,
    { headers: restHeaders(serviceKey) },
  );
  const text = await response.text();
  if (!response.ok) throw new Error(`citirea rândului a esuat: HTTP ${response.status} ${text.slice(0, 200)}`);
  const rows = JSON.parse(text);
  if (rows.length !== 1) throw new Error(`asteptam exact 1 rând pentru utilizatorul de test, am gasit ${rows.length}`);
  return rows[0];
}

async function patchRow({ baseUrl, serviceKey, userId, values }) {
  const response = await fetch(`${baseUrl}/rest/v1/subscriptions?user_id=eq.${userId}`, {
    method: 'PATCH',
    headers: restHeaders(serviceKey, { Prefer: 'return=representation' }),
    body: JSON.stringify(values),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`scrierea rândului a esuat: HTTP ${response.status} ${text.slice(0, 200)}`);
  return JSON.parse(text)[0];
}

async function callGate({ baseUrl, serviceKey, userId }) {
  const response = await fetch(`${baseUrl}/rest/v1/rpc/reserve_ai_request`, {
    method: 'POST',
    headers: restHeaders(serviceKey, { Prefer: 'return=representation' }),
    body: JSON.stringify({
      p_user_id: userId,
      p_guest_id: null,
      p_client_hash: TEST_CLIENT_HASH,
      p_ip_hash: TEST_IP_HASH,
    }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`apelul portii reserve_ai_request a esuat: HTTP ${response.status} ${text.slice(0, 300)}`);
  const parsed = JSON.parse(text);
  return Array.isArray(parsed) ? parsed[0] : parsed;
}

const show = (value) => JSON.stringify(value);

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const lines = [];
  const say = (text) => { lines.push(text); console.log(text); };

  if (!args['env-file']) {
    console.error('Lipseste --env-file=<cale catre supabase.env>.');
    process.exit(2);
  }
  const env = parseEnvFile(args['env-file']);
  const baseUrl = (env.get('SUPABASE_URL') ?? '').replace(/\/+$/, '');
  const serviceKey = env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!baseUrl || !serviceKey) {
    console.error('SUPABASE_URL sau SUPABASE_SERVICE_ROLE_KEY lipsesc din --env-file.');
    process.exit(2);
  }

  say('== premium-chain-verify (T2) ==');
  say(`utilizator de test: ${args.userId}`);
  say(`proiect: ${baseUrl}`);

  const snapshot = await readRow({ baseUrl, serviceKey, userId: args.userId });
  say('');
  say(`PAS 2 · rând INAINTE (snapshot): ${show(snapshot)}`);

  const periodEnd = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
  let restored = false;
  let gateRow = null;
  let appDailyLimit = null;
  let premiumActive = null;
  let appLimitExpression = '';
  let failure = '';

  try {
    const after = await patchRow({
      baseUrl,
      serviceKey,
      userId: args.userId,
      values: { status: 'active', plan: 'annual', environment: 'sandbox', current_period_end: periodEnd },
    });
    say(`PAS 3 · rând DUPA scriere (read-back): ${show(after)}`);

    gateRow = await callGate({ baseUrl, serviceKey, userId: args.userId });
    say(`PAS 4 · reserve_ai_request -> ${show(gateRow)}`);
    say(`PAS 4 · daily_limit din baza = ${show(gateRow?.daily_limit)} (consumat: 1 unitate din cota de test)`);

    // ── PAS 5 · derivarea din aplicatie, cu functiile reale ────────────────────────────────────
    const revenuecatModule = loadAppModule('src/lib/revenuecat.ts', {
      'react-native': { Platform: { OS: 'ios', select: () => ({}) } },
      'react-native-purchases': { default: {}, LOG_LEVEL: {}, PURCHASES_ERROR_CODE: {} },
    });
    const subscriptionModule = loadAppModule('src/lib/subscription.ts');

    // Exact obiectul pe care il primeste ecranul de la RevenueCat dupa o cumparare (formele reale
    // ale API-ului: `entitlements.active[lookup_key].isActive`).
    const customerInfo = {
      entitlements: {
        active: {
          premium: {
            isActive: true,
            identifier: 'premium',
            productIdentifier: 'ro.ortodoxia.premium.annual',
            expirationDate: periodEnd,
            willRenew: true,
          },
        },
        all: {},
      },
      activeSubscriptions: ['ro.ortodoxia.premium.annual'],
      managementURL: null,
    };
    premiumActive = revenuecatModule.isPremiumActive(customerInfo) === true;
    const inactiveFixture = { entitlements: { active: {}, all: {} } };
    const inactiveResult = revenuecatModule.isPremiumActive(inactiveFixture) === true;
    say(`PAS 5 · isPremiumActive(CustomerInfo cu entitlement premium activ) = ${premiumActive} (functia reala: src/lib/revenuecat.ts)`);
    say(`PAS 5 · isPremiumActive(CustomerInfo fara entitlement) = ${inactiveResult} (control: nu e o functie care intoarce mereu true)`);

    // Expresia de mapare a limitei, luata din hook-ul REAL, evaluata cu constantele REALE.
    const hookSource = readFileSync(path.join(REPO_ROOT, 'src/hooks/use-subscription.ts'), 'utf8');
    const expressionMatch = /dailyAiLimit:\s*([^,\n]+),/.exec(hookSource);
    if (!expressionMatch) throw new Error('nu am gasit expresia `dailyAiLimit:` in src/hooks/use-subscription.ts');
    appLimitExpression = expressionMatch[1].trim();
    appDailyLimit = vm.runInNewContext(appLimitExpression, {
      isPremium: premiumActive,
      PREMIUM_DAILY_AI_LIMIT: subscriptionModule.PREMIUM_DAILY_AI_LIMIT,
      FREE_DAILY_AI_LIMIT: subscriptionModule.FREE_DAILY_AI_LIMIT,
    });
    say(`PAS 5 · expresia din hook (verbatim): dailyAiLimit: ${appLimitExpression}`);
    say(`PAS 5 · evaluata cu isPremium=${premiumActive}, PREMIUM_DAILY_AI_LIMIT=${subscriptionModule.PREMIUM_DAILY_AI_LIMIT}, FREE_DAILY_AI_LIMIT=${subscriptionModule.FREE_DAILY_AI_LIMIT} -> dailyAiLimit = ${show(appDailyLimit)}`);
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  } finally {
    if (!args.keepRow) {
      const resetValues = {};
      for (const [key, value] of Object.entries(snapshot)) {
        if (key === 'updated_at') continue;
        resetValues[key] = value;
      }
      try {
        await patchRow({ baseUrl, serviceKey, userId: args.userId, values: resetValues });
        const back = await readRow({ baseUrl, serviceKey, userId: args.userId });
        say(`PAS 6 · rând RESETAT la snapshot (read-back): ${show(back)}`);
        const differences = BUSINESS_COLUMNS.filter((column) => show(back[column]) !== show(snapshot[column]));
        restored = differences.length === 0;
        say(`PAS 6 · coloane diferite fata de snapshot: ${differences.length === 0 ? 'niciuna' : differences.join(', ')}`);
      } catch (error) {
        say(`PAS 6 · RESETAREA A ESUAT: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      say('PAS 6 · --keep-row: rândul NU a fost resetat (cerut explicit).');
      restored = true;
    }
  }

  if (failure) say(`EROARE inainte de verdict: ${failure}`);

  const sqlLimit = gateRow?.daily_limit;
  const sqlOk = sqlLimit === 50;
  const appOk = appDailyLimit === 50;
  const pass = !failure && sqlOk && appOk && restored;

  say('');
  say(`PORTA SQL  daily_limit = ${show(sqlLimit)}   (asteptat 50)`);
  say(`APLICATIA  dailyAiLimit = ${show(appDailyLimit)}   (asteptat 50)`);
  if (!pass) {
    if (failure) say(`DIFERENTA: apelul nu s-a terminat — ${failure}`);
    if (!sqlOk) say(`DIFERENTA: poarta SQL a dat ${show(sqlLimit)} in loc de 50`);
    if (!appOk) say(`DIFERENTA: aplicatia a derivat ${show(appDailyLimit)} in loc de 50`);
    if (!restored) say('DIFERENTA: rândul de test nu a revenit exact la starea initiala');
  }
  say(`VERDICT: ${pass ? 'PASS' : 'FAIL'}`);

  if (args.json) {
    console.log(JSON.stringify({
      userId: args.userId,
      snapshot,
      gate: gateRow,
      sqlDailyLimit: sqlLimit,
      appDailyLimit,
      premiumActive,
      appLimitExpression,
      restored,
      verdict: pass ? 'PASS' : 'FAIL',
    }));
  }
  process.exit(pass ? 0 : 1);
}

main().catch((error) => {
  console.error(`EROARE: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
});
