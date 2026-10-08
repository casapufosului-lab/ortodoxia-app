#!/usr/bin/env node
/**
 * upload-play.mjs — urcă un AAB pe Google Play prin Play Developer API.
 *
 * DE CE EXISTĂ: uploadul manual din consolă ține ownerul în browser la fiecare lansare. Cu un
 * service account care are drept de publicare (Play Console → Users and permissions → „Release to
 * testing tracks" + „Manage production releases"), uploadul devine o comandă, pe care o poate
 * rula și orchestratorul. Nu se instalează nimic: JWT-ul se semnează cu `node:crypto`, iar
 * cererile folosesc `fetch`-ul din Node.
 *
 * CUM SE FOLOSEȘTE:
 *   node scripts/upload-play.mjs --dry-run                     (ce s-ar urca, fără să urce)
 *   node scripts/upload-play.mjs --track internal              (urcă pe Internal testing)
 *   node scripts/upload-play.mjs --track internal --notes "text"
 *   node scripts/upload-play.mjs --track production --status draft
 *
 * DEFAULTS: --aab android/app/build/outputs/bundle/release/app-release.aab
 *           --track internal · --status completed · --lang ro-RO
 *           --key %USERPROFILE%\Documents\ortodoxia-keystore-backup\play-service-account.json
 *
 * NOTĂ: un edit de Play expiră dacă nu e comis; dacă scriptul cade la mijloc, nu rămâne nimic
 * publicat. `--status draft` urcă versiunea fără s-o publice (util pentru Production).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const PKG = 'ro.ortodoxia.app';
const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3';
const UPLOAD = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3';
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

function flag(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const value = process.argv[i + 1];
  return value && !value.startsWith('--') ? value : true;
}

const options = {
  aab: flag('aab', path.join('android', 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab')),
  track: flag('track', 'internal'),
  status: flag('status', 'completed'),
  lang: flag('lang', 'ro-RO'),
  notes: flag('notes', ''),
  key: flag('key', path.join(os.homedir(), 'Documents', 'ortodoxia-keystore-backup', 'play-service-account.json')),
  dryRun: flag('dry-run', false) === true,
};

function log(...parts) {
  console.log('[upload-play]', ...parts);
}

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

/**
 * Găsește cheia de service account, în ordinea: `--key`, variabila de mediu
 * `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` (conținut JSON sau cale), `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_PATH`,
 * apoi fișierul implicit. Seiful Jaguar nu se citește direct de aici: valoarea se pune în
 * variabila de mediu (vezi docs/PLAY_UPLOAD.md), ca scriptul să nu depindă de alt proiect.
 */
function resolveServiceAccount(explicitPath) {
  if (explicitPath && fs.existsSync(explicitPath)) {
    return { json: fs.readFileSync(explicitPath, 'utf8'), from: explicitPath };
  }
  const fromEnv = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  if (fromEnv && fromEnv.trim()) {
    const value = fromEnv.trim();
    if (value.startsWith('{')) return { json: value, from: 'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON (mediu)' };
    if (fs.existsSync(value)) return { json: fs.readFileSync(value, 'utf8'), from: `${value} (mediu)` };
  }
  const fromEnvPath = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_PATH;
  if (fromEnvPath && fs.existsSync(fromEnvPath)) {
    return { json: fs.readFileSync(fromEnvPath, 'utf8'), from: `${fromEnvPath} (mediu)` };
  }
  const fallback = path.join(os.homedir(), 'Documents', 'ortodoxia-keystore-backup', 'play-service-account.json');
  if (fs.existsSync(fallback)) return { json: fs.readFileSync(fallback, 'utf8'), from: fallback };
  throw new Error(
    'nu am găsit cheia de service account: dă --key <cale>, sau GOOGLE_PLAY_SERVICE_ACCOUNT_JSON '
    + '(conținut/cale), sau GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_PATH',
  );
}

/** Semnează un JWT RS256 cu cheia service account-ului și îl schimbă pe un access token. */
async function getAccessToken(source) {
  const key = JSON.parse(source.json);
  if (key.type !== 'service_account' || !key.private_key) {
    throw new Error(`nu e o cheie de service account: ${source.from}`);
  }
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64url(JSON.stringify({
    iss: key.client_email, scope: SCOPE, aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600, iat: now,
  }));
  const signature = crypto.createSign('RSA-SHA256').update(`${header}.${claim}`).sign(key.private_key, 'base64url');
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claim}.${signature}`,
    }),
  });
  const body = await response.json();
  if (!response.ok || !body.access_token) {
    throw new Error(`autentificare eșuată (${response.status}): ${JSON.stringify(body).slice(0, 300)}`);
  }
  log('autentificat ca', key.client_email, '— cheie din', source.from);
  return body.access_token;
}

async function api(token, method, url, body) {
  const response = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${method} ${url} -> ${response.status}: ${text.slice(0, 400)}`);
  }
  return parsed;
}

/** Urcă AAB-ul cu upload resumable (fișierul e mare; uploadType=media nu e recomandat). */
async function uploadBundle(token, editId, aabPath) {
  const start = await fetch(`${UPLOAD}/applications/${PKG}/edits/${editId}/bundles?uploadType=resumable`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Upload-Content-Type': 'application/octet-stream',
    },
    body: JSON.stringify({}),
  });
  if (!start.ok) {
    throw new Error(`inițializare upload -> ${start.status}: ${(await start.text()).slice(0, 300)}`);
  }
  const location = start.headers.get('location');
  if (!location) throw new Error('serverul nu a întors URL-ul de upload');

  const bytes = fs.readFileSync(aabPath);
  log(`urc ${(bytes.length / 1024 / 1024).toFixed(1)} MB...`);
  const put = await fetch(location, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(bytes.length) },
    body: bytes,
  });
  const text = await put.text();
  if (!put.ok) throw new Error(`upload -> ${put.status}: ${text.slice(0, 300)}`);
  const bundle = JSON.parse(text);
  log('bundle urcat, versionCode =', bundle.versionCode ?? '(necunoscut)');
  return bundle;
}

async function main() {
  const aabPath = path.resolve(options.aab);
  log('track:', options.track, '| status:', options.status, '| aab:', aabPath);
  if (!fs.existsSync(aabPath)) throw new Error(`AAB-ul nu există: ${aabPath}`);

  const token = await getAccessToken(resolveServiceAccount(options.key));
  if (options.dryRun) {
    const edit = await api(token, 'POST', `${API}/applications/${PKG}/edits`, {});
    const list = await api(token, 'GET', `${API}/applications/${PKG}/edits/${edit.id}/tracks`);
    for (const track of list.tracks ?? []) {
      const releases = (track.releases ?? []).map((r) => `${r.status}:${(r.versionCodes ?? []).join(',')}`);
      log(`track ${track.track}: ${releases.join(' ') || '(gol)'}`);
    }
    await api(token, 'DELETE', `${API}/applications/${PKG}/edits/${edit.id}`);
    log('dry-run: edit anulat, nu s-a urcat nimic');
    return;
  }

  const edit = await api(token, 'POST', `${API}/applications/${PKG}/edits`, {});
  try {
    const bundle = await uploadBundle(token, edit.id, aabPath);
    const release = {
      status: options.status,
      versionCodes: [String(bundle.versionCode)],
      releaseNotes: options.notes
        ? [{ language: options.lang, text: String(options.notes) }]
        : undefined,
    };
    await api(token, 'PUT', `${API}/applications/${PKG}/edits/${edit.id}/tracks/${options.track}`, {
      track: options.track,
      releases: [release],
    });
    await api(token, 'POST', `${API}/applications/${PKG}/edits/${edit.id}:commit`);
    log(`GATA: versionCode ${bundle.versionCode} e pe track-ul ${options.track} (${options.status})`);
  } catch (error) {
    await api(token, 'DELETE', `${API}/applications/${PKG}/edits/${edit.id}`).catch(() => {});
    throw error;
  }
}

main().catch((error) => {
  console.error('[upload-play] EȘEC:', error.message);
  process.exit(1);
});
