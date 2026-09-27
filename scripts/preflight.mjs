// Verificare inainte de publicare (preflight).
// Ruleaza: npm run preflight
// Nu are nevoie de internet si nu instaleaza nimic.
// Verifica lucruri care se uita usor: identitatea aplicatiei, iconita, regulile
// proiectului si dosarul de lansare. Tipareste PASS / WARN / FAIL si iese cu
// cod 1 daca exista cel putin un FAIL.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const results = [];
const pass = (name, detail = '') => results.push({ level: 'PASS', name, detail });
const warn = (name, detail = '') => results.push({ level: 'WARN', name, detail });
const fail = (name, detail = '') => results.push({ level: 'FAIL', name, detail });

const RULES_MARK = ['v1', '2026-09-27'];

// 1. Regulile proiectului, in folderul de cod
const agentsPath = join(root, 'AGENTS.md');
if (!existsSync(agentsPath)) {
  fail('AGENTS.md exista', 'lipseste ' + agentsPath);
} else {
  const text = readFileSync(agentsPath, 'utf8');
  const missing = RULES_MARK.filter((m) => !text.includes(m));
  if (missing.length > 0) {
    fail('AGENTS.md are regulile la zi', 'nu contine: ' + missing.join(', ') + ' (se rescrie din Desktop\\REGULI-PROIECTE.md)');
  } else {
    pass('AGENTS.md are regulile la zi', 'versiunea ' + RULES_MARK.join(' '));
  }
}

// 2. Identitatea aplicatiei, din app.json
const appJsonPath = join(root, 'app.json');
let appJson = null;
if (!existsSync(appJsonPath)) {
  fail('app.json exista', 'lipseste ' + appJsonPath);
} else {
  try {
    appJson = JSON.parse(readFileSync(appJsonPath, 'utf8')).expo;
    pass('app.json se citeste', '');
  } catch (error) {
    fail('app.json se citeste', String(error.message));
  }
}

if (appJson) {
  const required = [
    ['name', appJson.name],
    ['slug', appJson.slug],
    ['version', appJson.version],
    ['android.package', appJson.android?.package],
    ['ios.bundleIdentifier', appJson.ios?.bundleIdentifier],
  ];
  for (const [key, value] of required) {
    if (typeof value === 'string' && value.trim() !== '') pass('app.json: ' + key, value);
    else fail('app.json: ' + key, 'lipseste sau e gol');
  }

  const icon = appJson.icon;
  if (typeof icon === 'string' && icon.trim() !== '') {
    const iconPath = join(root, icon);
    if (existsSync(iconPath)) pass('iconita exista', icon + ' (' + statSync(iconPath).size + ' B)');
    else fail('iconita exista', 'fisierul ' + icon + ' nu e pe disc');
  } else {
    warn('iconita', 'app.json nu are expo.icon ca text - se verifica manual');
  }

  const version = appJson.version;
  if (typeof version === 'string' && /^\d+\.\d+\.\d+$/.test(version)) pass('versiunea are forma x.y.z', version);
  else warn('versiunea are forma x.y.z', 'acum: ' + String(version));
}

// 3. Dosarul de lansare (texte magazin, justificari, Data safety)
const dossierHints = /PENTRU-GOOGLE-PLAY|STORE_SUBMISSION|LANSARE|STORE|LISTING/i;
const candidates = [
  join(root, 'docs'),
  join(root, 'store'),
  join(root, 'android-store'),
  root,
  join(root, '..', 'docs'),
  join(root, '..', 'store'),
];
let dossierFound = null;
for (const dir of candidates) {
  if (!existsSync(dir) || dossierFound) continue;
  for (const entry of readdirSync(dir)) {
    if (entry.endsWith('.md') && dossierHints.test(entry)) {
      dossierFound = join(dir, entry);
      break;
    }
  }
}
if (dossierFound) pass('dosar de lansare gasit', dossierFound.replace(root + '\\', ''));
else warn('dosar de lansare', 'nu am gasit niciun fisier cu texte de magazin in docs/ sau store/');

// 3b. Capturi si grafica pentru magazin
let shotsDir = null;
let shots = [];
for (const dir of candidates) {
  const candidate = join(dir, 'screenshots');
  if (existsSync(candidate)) {
    shotsDir = candidate;
    shots = readdirSync(candidate).filter((f) => /\.(png|jpg|jpeg)$/i.test(f));
    break;
  }
}
if (shotsDir) {
  if (shots.length > 0) pass('capturi pentru magazin', shots.length + ' fisiere in ' + shotsDir.replace(root + '\\', '') + (shotsDir.startsWith(root) ? '' : ' (langa proiect)'));
  else warn('capturi pentru magazin', 'folderul ' + shotsDir.replace(root + '\\', '') + ' e gol');
} else {
  warn('capturi pentru magazin', 'nu exista folderul store/screenshots');
}

// 4. Teste automate
let pkg = null;
try {
  pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
} catch {
  fail('package.json se citeste', 'lipseste sau e invalid');
}
if (pkg) {
  const scripts = pkg.scripts ?? {};
  if (scripts.test) pass('exista script de teste', scripts.test);
  else warn('teste automate', 'nu exista script "test" - nimic nu verifica logica aplicatiei');
  if (scripts.typecheck) pass('exista script de typecheck', scripts.typecheck);
  else warn('typecheck', 'nu exista script "typecheck"');
}

// Rezumat
const width = Math.max(...results.map((r) => r.name.length));
for (const r of results) {
  console.log(r.level.padEnd(5) + ' ' + r.name.padEnd(width) + (r.detail ? '  -> ' + r.detail : ''));
}
const counts = results.reduce((acc, r) => ({ ...acc, [r.level]: (acc[r.level] ?? 0) + 1 }), {});
console.log('');
console.log('PASS: ' + (counts.PASS ?? 0) + '   WARN: ' + (counts.WARN ?? 0) + '   FAIL: ' + (counts.FAIL ?? 0));

if ((counts.FAIL ?? 0) > 0) {
  console.log('Rezultat: NU e gata. Repara FAIL-urile de mai sus.');
  process.exit(1);
}
console.log('Rezultat: verificarea a trecut. WARN-urile se citesc, nu blocheaza.');
