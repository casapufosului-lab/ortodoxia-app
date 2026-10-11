#!/usr/bin/env node
/**
 * T1 (10.10.2026) — SANATATEA CHEII REVENUECAT FOLOSITE DE WEBHOOK PE API v1.
 *
 * DE CE EXISTA
 * ------------
 * Webhook-ul `revenuecat-webhook` (v16) nu decide Premium din payload: cheama
 * `GET https://api.revenuecat.com/v1/subscribers/<app_user_id>` cu secretul `REVENUECAT_API_KEY` si
 * raspunde **502 exact cand acel apel esueaza** (core.ts:597-611), **500 cand scrierea esueaza**, iar
 * **200 cand amandoua reusesc**. Un webhook sanatos depinde deci de o cheie care functioneaza pe API v1.
 *
 * CAPCANA CARE A FOST CONFIRMATA PE 10.10.2026 (dovada: tool-output/t10-key-identity.txt)
 * -------------------------------------------------------------------------------------
 * `GET https://api.supabase.com/v1/projects/{ref}/secrets` NU intorce valoarea reala a secretelor:
 * s-a scris un secret-sonda de 33 de caractere si s-a citit inapoi o valoare de 64 de caractere
 * (diferita). Valoarea „citita inapoi" pentru `REVENUECAT_API_KEY` (prefix 04e8e, 64 de caractere)
 * primeste deci 401 de la v1 desi cheia EFECTIVA a functiei trece de v1 (sonda prin functia
 * deployata a ajuns la pasul de scriere, adica apelul RevenueCat a reusit).
 * Consecinta: PARTEA A a scriptului nu poate hotari singura sanatatea productiei. De aceea scriptul are
 * si PARTEA B, care cheama functia DEPLOYATA (`--through-function`) — singurul observabil al cheii
 * efective — si iese 0 pe baza ei.
 *
 * CODURI (aceeasi contractie ca in functie)
 * -----------------------------------------
 *   PART B: 200 = cheia + scrierea merg · 500 = cheia merge, scrierea a esuat (ex. abonatul RC nu are
 *   cont in auth.users → violare de cheie straina) · 502 = cheia NU merge pe v1 · 401 = token de webhook
 *   greu (nepotrivit), verdict imposibil.
 *
 * CE NU FACE
 * ----------
 * Nu scrie in RevenueCat, nu modifica vreun secret, nu imprima niciodata valoarea vreunei chei
 * (doar prefix de 5 caractere + lungime). Cheile se citesc la rulare din fisierele `.env` date ca
 * parametri si traiesc doar in memorie.
 *
 * UTILIZARE
 * ---------
 *   # PARTEA A (+ candidati), cum cere T1:
 *   node scripts/revenuecat-key-health.mjs --env-file=C:\Users\pcgar\.ow-secrets\supabase.env
 *   node scripts/revenuecat-key-health.mjs --env-file=<supabase.env> \
 *        --secret-key-file=<revenuecat.env> --secret-key-name=REVENUECAT_SECRET_API_KEY_V2
 *   node scripts/revenuecat-key-health.mjs --env-file=<supabase.env> \
 *        --secret-key-file=<app .env> --secret-key-name=EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY
 *
 *   # VERDICTUL REAL (cheia efectiva a functiei deployate):
 *   node scripts/revenuecat-key-health.mjs --env-file=<supabase.env> --through-function \
 *        --webhook-env-file=<revenuecat.env> --subscriber=<uuid-ul-abonatului-real>
 *
 * Parametri: --env-file=<cale> (obligatoriu) · --secret-key=<valoare> · --secret-key-file=<cale> ·
 * --secret-key-name=<NUME> · --through-function · --webhook-env-file=<cale> · --subscriber=<uuid> · --json
 */

import { readFileSync } from 'node:fs';
import process from 'node:process';

/** Abonatul de test care EXISTA in RevenueCat (entitlement `premium` activ, sandbox). */
const DEFAULT_SUBSCRIBER_ID = '9e238faf-7d56-4999-bff5-a51f0ef20b5a';
/** Un id care nu poate fi un client real: sonda informationala. */
const UNKNOWN_SUBSCRIBER_ID = '00000000-0000-4000-8000-000000000000';
const REVENUECAT_V1_BASE = 'https://api.revenuecat.com/v1';
const SUPABASE_API_BASE = 'https://api.supabase.com/v1';

/** Prefix de 5 caractere + lungime. NICIODATA valoarea. */
function fingerprint(value) {
  if (typeof value !== 'string' || value.length === 0) return '(lipsa)';
  return `prefix=${value.slice(0, 5)}… lungime=${value.length}`;
}

/** Scoate orice urma a unei chei din textul care ajunge pe ecran. */
function redact(text, secrets) {
  let out = String(text ?? '');
  for (const secret of secrets) {
    if (typeof secret !== 'string' || secret.length < 8) continue;
    out = out.split(secret).join('***');
    out = out.split(secret.slice(0, 12)).join('***');
    out = out.split(secret.slice(-12)).join('***');
  }
  return out;
}

/** Parser minimal de fisier `.env` (`NUME=valoare`), fara sa imprima nimic. */
function parseEnvFile(path) {
  const text = readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
  const values = new Map();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    const name = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values.set(name, value);
  }
  return values;
}

function parseArgs(argv) {
  const args = { subscriber: DEFAULT_SUBSCRIBER_ID, json: false };
  for (const raw of argv) {
    if (raw === '--json') { args.json = true; continue; }
    if (raw === '--through-function') { args['through-function'] = true; continue; }
    const match = /^--([a-z-]+)=(.*)$/.exec(raw);
    if (!match) continue;
    const [, name, value] = match;
    // `--secret-key-file` / `--secret-key-name` se pot repeta (perechi in ordine).
    if (name === 'secret-key-file' || name === 'secret-key-name') {
      const bucket = `${name}s`.replace('--', '');
      args[bucket] = [...(args[bucket] ?? []), value];
      continue;
    }
    args[name] = value;
  }
  return args;
}

/** Apelul EXACT pe care il face functia: `GET /v1/subscribers/<id>` cu `Bearer <cheie>`. */
async function probeSubscriber(apiKey, subscriberId) {
  const url = `${REVENUECAT_V1_BASE}/subscribers/${encodeURIComponent(subscriberId)}`;
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    });
    const bodyText = await response.text();
    let message = '';
    try {
      const parsed = JSON.parse(bodyText);
      message = String(parsed?.message ?? parsed?.error ?? '');
    } catch {
      message = bodyText.slice(0, 200);
    }
    return { status: response.status, ok: response.status === 200, message };
  } catch (error) {
    return { status: 0, ok: false, message: `eroare de retea: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/** Cheia + metadatele ei, citite din Supabase (Management API). Valoarea NU se imprima. */
async function readSupabaseSecret({ accessToken, projectRef, name }) {
  const response = await fetch(`${SUPABASE_API_BASE}/projects/${projectRef}/secrets`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  });
  if (!response.ok) throw new Error(`Management API /secrets a raspuns HTTP ${response.status}`);
  const payload = await response.json();
  const entry = Array.isArray(payload) ? payload.find((item) => item?.name === name) : null;
  if (!entry) throw new Error(`secretul ${name} nu exista in proiectul ${projectRef}`);
  return { value: String(entry.value ?? ''), updatedAt: String(entry.updated_at ?? '(necunoscut)') };
}

/** Rândul din `public.subscriptions` (service role), pentru dovada scrierii. */
async function readRow({ supabaseUrl, serviceKey, userId }) {
  if (!supabaseUrl || !serviceKey) return '(fara cheie de service role: rândul nu se citeste)';
  const response = await fetch(
    `${supabaseUrl}/rest/v1/subscriptions?user_id=eq.${userId}&select=status,plan,provider,environment,current_period_end`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
  );
  return `HTTP ${response.status} ${(await response.text()).slice(0, 300)}`;
}

/** PARTEA B: singurul observabil al cheii EFECTIVE — functia deployata. */
async function probeThroughFunction({ supabaseUrl, webhookToken, subscriberId, json }) {
  const nowMs = Date.now();
  const payload = {
    event: {
      type: 'INITIAL_PURCHASE',
      id: `key-health-${nowMs}`,
      app_user_id: subscriberId,
      product_id: 'ro.orthodoxia.premium.annual',
      store: 'APP_STORE',
      environment: 'SANDBOX',
      entitlement_ids: ['premium'],
      purchased_at_ms: nowMs,
      expiration_at_ms: nowMs + 30 * 24 * 3600 * 1000,
      transaction_id: `key-health-${nowMs}`,
      period_type: 'NORMAL',
    },
    api_version: '1.0',
  };
  const response = await fetch(`${supabaseUrl}/functions/v1/revenuecat-webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${webhookToken}` },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  json(text.slice(0, 300));
  return { status: response.status, body: text.slice(0, 300) };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const lines = [];
  const say = (text) => { lines.push(text); console.log(text); };
  const jsonLines = [];
  const json = (text) => { jsonLines.push(text); };

  if (!args['env-file']) {
    console.error('Lipseste --env-file=<cale catre supabase.env> (secretele nu se citesc de nicaieri altundeva).');
    process.exit(2);
  }

  const env = parseEnvFile(args['env-file']);
  const accessToken = env.get('SUPABASE_ACCESS_TOKEN') ?? process.env.SUPABASE_ACCESS_TOKEN ?? '';
  const projectRef = env.get('SUPABASE_PROJECT_REF') ?? '';
  const supabaseUrl = env.get('SUPABASE_URL') ?? '';
  const serviceKey = env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!accessToken) { console.error('SUPABASE_ACCESS_TOKEN lipseste din --env-file.'); process.exit(2); }
  if (!projectRef) { console.error('SUPABASE_PROJECT_REF lipseste din --env-file.'); process.exit(2); }

  // Cheile candidate (optionale): argument direct sau dintr-un al doilea fisier `.env`.
  const candidates = [];
  if (typeof args['secret-key'] === 'string') {
    candidates.push({ label: '--secret-key', value: args['secret-key'] });
  }
  const keyFiles = Array.isArray(args['secret-key-files']) ? args['secret-key-files'] : [];
  for (const [index, file] of keyFiles.entries()) {
    const name = (Array.isArray(args['secret-key-names']) ? args['secret-key-names'][index] : undefined) ?? 'REVENUECAT_V1_SECRET_KEY';
    const altEnv = parseEnvFile(file);
    const value = altEnv.get(name) ?? '';
    if (!value) { console.error(`Variabila ${name} lipseste din ${file}.`); process.exit(2); }
    candidates.push({ label: `${name} din ${file}`, value });
  }
  const secretsToRedact = [accessToken, ...candidates.map((candidate) => candidate.value)];

  const subscriberId = String(args.subscriber);
  const throughFunction = args['through-function'] === true;

  say('== revenuecat-key-health (T1) ==');
  say(`proiect Supabase: ${projectRef}`);
  say(`abonat real pentru PASS/FAIL: ${subscriberId}`);

  const stored = await readSupabaseSecret({ accessToken, projectRef, name: 'REVENUECAT_API_KEY' });
  secretsToRedact.push(stored.value);
  say(`REVENUECAT_API_KEY din Supabase: ${fingerprint(stored.value)} · actualizat: ${stored.updatedAt}`);

  const primary = await probeSubscriber(stored.value, subscriberId);
  say(`PART A · GET /v1/subscribers/<abonat real> cu valoarea citita din Management API → HTTP ${primary.status}${primary.message ? ` (${redact(primary.message, secretsToRedact)})` : ''}`);
  if (!primary.ok) {
    say('PART A nu poate hotari singura: valoarea returnata de Management API este MASCATA (dovada: un secret-sonda de 33 de caractere s-a citit inapoi ca 64 de caractere). Verdictul real il da PART B (--through-function).');
  }

  const unknownProbe = await probeSubscriber(stored.value, UNKNOWN_SUBSCRIBER_ID);
  say(`INFO sonda pe un abonat inexistent (nu decide nimic) → HTTP ${unknownProbe.status}${unknownProbe.message ? ` (${redact(unknownProbe.message, secretsToRedact)})` : ''}`);

  const alternatives = [];
  for (const candidate of candidates) {
    secretsToRedact.push(candidate.value);
    const probe = await probeSubscriber(candidate.value, subscriberId);
    alternatives.push({ label: candidate.label, fingerprint: fingerprint(candidate.value), status: probe.status, ok: probe.ok });
    say(`PART A2 · ${candidate.label}: ${fingerprint(candidate.value)} → HTTP ${probe.status}${probe.message ? ` (${redact(probe.message, secretsToRedact)})` : ''}`);
    say(probe.ok
      ? `PART A2 · ${candidate.label} FUNCTIONEAZA pe v1 (poate fi pusa in REVENUECAT_API_KEY, fara redeploy).`
      : `PART A2 · ${candidate.label} NU functioneaza pe v1.`);
  }

  let partB = null;
  if (throughFunction) {
    const webhookEnv = args['webhook-env-file'] ? parseEnvFile(args['webhook-env-file']) : new Map();
    const webhookToken = webhookEnv.get('REVENUECAT_WEBHOOK_AUTH_TOKEN') ?? '';
    if (!supabaseUrl || !webhookToken) {
      console.error('--through-function cere SUPABASE_URL in --env-file si REVENUECAT_WEBHOOK_AUTH_TOKEN in --webhook-env-file.');
      process.exit(2);
    }
    secretsToRedact.push(webhookToken);
    say('');
    say(`INFO rând inainte: ${await readRow({ supabaseUrl, serviceKey, userId: subscriberId })}`);
    const result = await probeThroughFunction({ supabaseUrl, webhookToken, subscriberId, json });
    say(`PART B · functia DEPLOYATA, eveniment acceptat (sandbox + entitlement premium) → HTTP ${result.status} | ${redact(result.body, secretsToRedact)}`);
    say(`INFO rând dupa: ${await readRow({ supabaseUrl, serviceKey, userId: subscriberId })}`);
    partB = { status: result.status, ok: result.status === 200 || result.status === 500 };
    say(partB.ok
      ? 'PART B: cheia EFECTIVA trece de API v1 (apelul RevenueCat a reusit).'
      : `PART B: cheia EFECTIVA NU trece de API v1 (HTTP ${result.status}).`);
  }

  const pass = throughFunction ? partB?.ok === true : primary.ok;
  const verdict = pass
    ? 'PASS'
    : `FAIL${throughFunction ? ` (PART B HTTP ${partB?.status})` : ` (PART A HTTP ${primary.status}${primary.message ? `: ${redact(primary.message, secretsToRedact)}` : ''} — valoarea citita inapoi e mascata)`}`;
  say(`VERDICT: ${verdict}`);

  if (args.json) {
    console.log(JSON.stringify({
      projectRef,
      subscriberId,
      supabaseKey: { fingerprint: fingerprint(stored.value), updatedAt: stored.updatedAt },
      partA: { status: primary.status, ok: primary.ok },
      unknownSubscriberProbeStatus: unknownProbe.status,
      partA2: alternatives,
      partB,
      verdict: pass ? 'PASS' : 'FAIL',
    }));
  }

  process.exit(pass ? 0 : 1);
}

main().catch((error) => {
  console.error(`EROARE: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
});
