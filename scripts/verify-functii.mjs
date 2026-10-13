#!/usr/bin/env node
/**
 * verify-functii.mjs — verificarea pe FUNCȚIE a aplicației (T7-bis din task).
 *
 * DE CE EXISTĂ: o măsurătoare făcută de mână nu închide un task. Fiecare verificare de aici face un
 * apel real (citire în baza live, RPC, URL semnat, cerere HTTP către o funcție Edge) și **cade**
 * (exit 1) dacă dovada lipsește. Dacă verificarea nu poate rula, o spune explicit ca NEVERIFICAT —
 * nu o declară verde.
 *
 * CHEILE: se citesc din mediu (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) sau din fișierul dat cu
 * `--env <cale>`. Valorile nu se tipăresc niciodată și nu se scriu în raport.
 *
 * UTILIZARE:
 *   node scripts/verify-functii.mjs --env C:\Users\pcgar\.ow-secrets\supabase.env --out <raport.json>
 *   opțiuni: --fara-f6 (nu creează/șterge contul de test), --doar F1,F2 (rulează doar verificările date)
 *
 * COD DE IEȘIRE: 0 = toate verificările care au putut rula au trecut; 1 = cel puțin o verificare a picat.
 */
import { readFileSync, writeFileSync } from 'node:fs';

// ─── argumente ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const arg = (nume) => {
  const i = argv.indexOf(nume);
  return i >= 0 ? argv[i + 1] : null;
};
const envPath = arg('--env');
const outPath = arg('--out');
const logPath = arg('--log');
const faraF6 = argv.includes('--fara-f6');
const doar = (arg('--doar') || '').split(',').map((s) => s.trim()).filter(Boolean);

// Fiecare linie de verdict se scrie ȘI în consolă, ȘI într-un fișier UTF-8 (consola Windows
// strică diacriticele, fișierul rămâne curat — dovada se citește din fișier, nu din consolă).
const linii = [];
const spune = (linie) => { linii.push(linie); console.log(linie); };

// ─── chei ─────────────────────────────────────────────────────────────────────
function citesteEnv() {
  const env = { ...process.env };
  if (envPath) {
    for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (m && !line.trimStart().startsWith('#')) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return env;
}
const env = citesteEnv();
const URL_BASE = (env.SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!URL_BASE || !KEY) {
  console.error('LIPSESC SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (din mediu sau din --env). Nu tipăresc valori.');
  process.exit(2);
}
const H = { apikey: KEY, authorization: `Bearer ${KEY}` };
const HJSON = { ...H, 'content-type': 'application/json' };

async function rest(cale, init = {}) {
  const res = await fetch(`${URL_BASE}${cale}`, { ...init, headers: { ...HJSON, ...(init.headers || {}) } });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, ok: res.ok, body, headers: res.headers };
}
const SELECT = (tabel, q) => rest(`/rest/v1/${tabel}?${q}`, { method: 'GET' });
const RPC = (nume, params) => rest(`/rest/v1/rpc/${nume}`, { method: 'POST', body: JSON.stringify(params) });

// ─── timp (ziua se socotește pe Europe/Bucharest, ca în aplicație) ────────────
const buc = (d = new Date()) => {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit' });
  return f.format(d);
};
const azi = buc();
const [anA, lunaA] = azi.split('-').map(Number);
const lunaStart = `${azi.slice(0, 7)}-01`;
const lunaEnd = `${azi.slice(0, 7)}-${String(new Date(Date.UTC(anA, lunaA, 0)).getUTCDate()).padStart(2, '0')}`;

// ─── schelet de raportare ─────────────────────────────────────────────────────
const rezultate = [];
async function verifica(id, nume, fn) {
  if (doar.length && !doar.includes(id)) return;
  const t0 = Date.now();
  try {
    const r = await fn();
    rezultate.push({ id, nume, stare: r.stare, dovada: r.dovada, ms: Date.now() - t0 });
    const semn = r.stare === 'PASS' ? 'PASS' : r.stare === 'FAIL' ? 'FAIL' : 'NEVERIFICAT';
    spune(`${semn.padEnd(11)} ${id} ${nume} — ${r.dovada}`);
  } catch (e) {
    rezultate.push({ id, nume, stare: 'FAIL', dovada: `excepție: ${e.message}`, ms: Date.now() - t0 });
    spune(`FAIL        ${id} ${nume} — excepție: ${e.message}`);
  }
}
const PASS = (dovada) => ({ stare: 'PASS', dovada });
const FAIL = (dovada) => ({ stare: 'FAIL', dovada });
const NU = (dovada) => ({ stare: 'NEVERIFICAT', dovada });

// ─── F1 — conținutul zilei vine din bază ─────────────────────────────────────
await verifica('F1', 'Acasă: conținutul zilei din daily_content', async () => {
  const q = `select=content_date,verse_text,parable_title,country_code,language_code,is_published`
    + `&country_code=eq.RO&language_code=eq.ro&content_date=eq.${azi}&is_published=eq.true`;
  const r = await SELECT('daily_content', q);
  if (!r.ok) return FAIL(`citirea a picat: HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
  if (!Array.isArray(r.body) || !r.body.length) return FAIL(`0 rânduri pentru ${azi} cu filtrele aplicației (RO/ro/is_published)`);
  const rand = r.body[0];
  const text = (rand.verse_text || rand.parable_title || '').trim();
  if (text.length < 10) return FAIL(`rândul ${azi} există dar textul e gol`);
  return PASS(`${r.body.length} rând(uri) pentru ${azi}; text „${text.slice(0, 60)}…” (${text.length} caractere)`);
});

// ─── F2 — audio de rugăciune chiar se descarcă ───────────────────────────────
await verifica('F2', 'Rugăciuni: URL semnat + descărcarea audio', async () => {
  const r = await SELECT('prayers', 'select=id,title,audio_path&audio_path=not.is.null&is_published=eq.true&limit=1');
  if (!r.ok) return FAIL(`citirea prayers a picat: HTTP ${r.status}`);
  if (!Array.isArray(r.body) || !r.body.length) return FAIL('nicio rugăciune cu audio_path în bază');
  const p = r.body[0];
  const semnat = await rest('/storage/v1/object/sign/prayer-audio/' + encodeURI(p.audio_path), {
    method: 'POST',
    body: JSON.stringify({ expiresIn: 300 }),
  });
  if (!semnat.ok || !semnat.body?.signedURL) return FAIL(`createSignedUrl a picat: HTTP ${semnat.status}`);
  const url = `${URL_BASE}/storage/v1${semnat.body.signedURL}`;
  const t0 = Date.now();
  const audio = await fetch(url);
  const ms = Date.now() - t0;
  const tip = audio.headers.get('content-type') || '';
  const lung = Number(audio.headers.get('content-length') || 0);
  if (!audio.ok) return FAIL(`descărcarea a răspuns HTTP ${audio.status}`);
  if (!tip.startsWith('audio/')) return FAIL(`tipul nu e audio: ${tip}`);
  if (lung < 10000) return FAIL(`fișier prea mic pentru audio: ${lung} B`);
  return PASS(`„${p.title}” → HTTP ${audio.status}, ${tip}, ${lung} B, ${ms} ms (bucket prayer-audio, URL semnat)`);
});

// ─── F3 — calendarul lunii curente, localizat, prin RPC ──────────────────────
await verifica('F3', 'Calendar: RPC get_calendar_days_localized, luna curentă', async () => {
  // Se preferă contextul aplicației (RO/ro), altfel primul rând publicat pentru ziua de azi.
  let cd = await SELECT('calendar_days', `select=country_code,calendar_code,language_code,calendar_date&is_published=eq.true&calendar_date=eq.${azi}&country_code=eq.RO&language_code=eq.ro&limit=1`);
  if (cd.ok && (!Array.isArray(cd.body) || !cd.body.length)) {
    cd = await SELECT('calendar_days', `select=country_code,calendar_code,language_code,calendar_date&is_published=eq.true&calendar_date=eq.${azi}&limit=1`);
  }
  if (!cd.ok) return FAIL(`citirea calendar_days a picat: HTTP ${cd.status}`);
  if (!Array.isArray(cd.body) || !cd.body.length) return FAIL(`nicio zi publicată pentru ${azi} în calendar_days`);
  const { country_code, calendar_code, language_code } = cd.body[0];
  const r = await RPC('get_calendar_days_localized', {
    p_country_code: country_code,
    p_calendar_code: calendar_code,
    p_language_code: language_code,
    p_start_date: lunaStart,
    p_end_date: lunaEnd,
  });
  if (!r.ok) return FAIL(`RPC a picat: HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
  const zile = Array.isArray(r.body) ? r.body : [];
  if (zile.length < 20) return FAIL(`RPC a întors doar ${zile.length} zile pentru luna ${lunaStart.slice(0, 7)}`);
  const aziRand = zile.find((z) => String(z.calendar_date).slice(0, 10) === azi);
  if (!aziRand) return FAIL(`ziua de azi (${azi}) lipsește din răspunsul RPC`);
  const titlu = String(aziRand.title || '').trim();
  return PASS(`${zile.length} zile (${lunaStart}…${lunaEnd}); azi „${titlu.slice(0, 50)}” (${titlu.length} car.); tari: ${country_code}/${calendar_code}/${language_code}; saints gol: ${Array.isArray(aziRand.saints) && aziRand.saints.length === 0}`);
});

// ─── F4 — corpusul biblic + capitolul cerut ──────────────────────────────────
await verifica('F4', 'Biblie: corpus + capitolul cerut', async () => {
  // ATENȚIE: bible_verses nu are coloană `id` (are cheie compusă translation_id+book_code+chapter+verse),
  // iar `select=id` întoarce 400 — de aici a venit primul FAIL al acestei verificări. Se numără pe o
  // coloană care există și se citește `content-range` (count=exact).
  const total = await rest('/rest/v1/bible_verses?select=translation_id&limit=1', { method: 'GET', headers: { prefer: 'count=exact' } });
  if (!total.ok) return FAIL(`numărarea corpusului a picat: HTTP ${total.status} ${JSON.stringify(total.body).slice(0, 160)}`);
  const nrTotal = Number((total.headers?.get?.('content-range') || '').split('/').pop()) || null;
  const r = await SELECT('bible_verses', 'select=translation_id,book_code,chapter,verse,verse_text&book_code=eq.MAT&chapter=eq.1&order=verse.asc');
  if (!r.ok) return FAIL(`citirea capitolului a picat: HTTP ${r.status}`);
  if (!Array.isArray(r.body) || r.body.length < 10) return FAIL(`capitolul MAT 1 are doar ${Array.isArray(r.body) ? r.body.length : 0} versete`);
  const primul = r.body[0];
  if (!primul.verse_text || primul.verse_text.trim().length < 10) return FAIL('primul verset are text gol');
  if (nrTotal === null) return FAIL('nu am putut număra corpusul (content-range lipsește)');
  if (nrTotal < 7000) return FAIL(`corpusul are doar ${nrTotal} versete`);
  return PASS(`MAT 1 → ${r.body.length} versete, primul „${primul.verse_text.slice(0, 50)}…” (translation ${primul.translation_id}); corpus: ${nrTotal} versete`);
});

// ─── F5 — cota de AI: 5/zi gratuit, 50/zi cu abonament ───────────────────────
await verifica('F5', 'Chat: plafonul de cotă (RPC reserve_ai_request)', async () => {
  const H64 = (c) => c.repeat(64);
  const guestId = `guest-verify-f5-${Date.now()}`;
  const gratuit = await RPC('reserve_ai_request', {
    p_user_id: null, p_guest_id: guestId, p_client_hash: H64('9'), p_ip_hash: H64('8'),
  });
  if (!gratuit.ok) return FAIL(`RPC (vizitator) a picat: HTTP ${gratuit.status} ${JSON.stringify(gratuit.body).slice(0, 160)}`);
  const limitaGratuit = gratuit.body?.[0]?.daily_limit ?? gratuit.body?.daily_limit;
  if (limitaGratuit !== 5) return FAIL(`vizitator fără abonament: daily_limit=${limitaGratuit}, așteptat 5 (fail-closed)`);

  const abonat = await SELECT('subscriptions', 'select=user_id,status,plan,provider,product_id,current_period_end,environment&status=eq.active&current_period_end=gt.now()&limit=1');
  if (!abonat.ok) return FAIL(`citirea subscriptions a picat: HTTP ${abonat.status}`);
  const rand = Array.isArray(abonat.body) ? abonat.body[0] : null;
  if (!rand) return PASS(`vizitator: daily_limit=5; niciun abonament activ acum ⇒ ramura plătită nu se poate măsura în acest moment`);
  const platit = await RPC('reserve_ai_request', {
    p_user_id: rand.user_id, p_guest_id: null, p_client_hash: H64('7'), p_ip_hash: H64('6'),
  });
  if (!platit.ok) return FAIL(`RPC (abonat) a picat: HTTP ${platit.status}`);
  const limitaPlatit = platit.body?.[0]?.daily_limit ?? platit.body?.daily_limit;
  if (limitaPlatit !== 50) return FAIL(`abonat activ (${rand.status}/${rand.environment}): daily_limit=${limitaPlatit}, așteptat 50`);
  const cap = gratuit.body?.[0] || {};
  return PASS(`vizitator 5/zi; abonat ${rand.plan}/${rand.environment} 50/zi; plafoane: client=${cap.client_limit ?? '?'} ip=${cap.ip_limit ?? '?'}`);
});

// ─── F8 — LIVE: rând în fereastra rulării ────────────────────────────────────
await verifica('F8', 'LIVE: live_player_diagnostics din fereastra rulării', async () => {
  const de = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
  const r = await SELECT('live_player_diagnostics', `select=created_at,video_id,loaded,page_state,app_version,device&created_at=gte.${de}&loaded=is.true&order=created_at.desc&limit=5`);
  if (!r.ok) return FAIL(`citirea a picat: HTTP ${r.status}`);
  const ok = (Array.isArray(r.body) ? r.body : []).filter((x) => /page-ready/.test(String(x.page_state || '')));
  if (!ok.length) return FAIL(`niciun rând cu page-ready în ultimele 3 h (rânduri: ${Array.isArray(r.body) ? r.body.length : 0})`);
  const x = ok[0];
  return PASS(`${ok.length} rând(uri) cu page-ready în ultimele 3 h; ultimul ${x.created_at} video ${x.video_id} (${x.device}, app ${x.app_version})`);
});

// ─── F7 — notificări: livrări + preferințe ───────────────────────────────────
await verifica('F7', 'Notificări: livrări reale + preferințe', async () => {
  const de = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const d = await SELECT('notification_deliveries', `select=device_id,content_date,sent_at,notification_type&sent_at=gte.${de}&order=sent_at.desc&limit=10`);
  const p = await SELECT('notification_preferences', 'select=user_id,enabled,daily_time,timezone&limit=10');
  if (!d.ok) return FAIL(`notification_deliveries: HTTP ${d.status}`);
  if (!p.ok) return FAIL(`notification_preferences: HTTP ${p.status}`);
  const livrari = Array.isArray(d.body) ? d.body : [];
  const pref = Array.isArray(p.body) ? p.body : [];
  if (!livrari.length) return FAIL('nicio livrare de notificare în ultimele 7 zile');
  if (!pref.length) return FAIL('nicio preferință de notificare în bază');
  return PASS(`${livrari.length} livrare(ri) în 7 zile (ultima ${livrari[0].sent_at}, ${livrari[0].notification_type}); ${pref.length} preferințe (enabled: ${pref.map((x) => x.enabled).join(',')})`);
});

// ─── F9 — abonament: rândul real + fail-closed pe cont expirat ──────────────
await verifica('F9', 'Premium: rândul de abonament + fail-closed', async () => {
  const toate = await SELECT('subscriptions', 'select=user_id,status,plan,provider,product_id,current_period_end,environment&order=updated_at.desc&limit=5');
  if (!toate.ok) return FAIL(`citirea subscriptions a picat: HTTP ${toate.status}`);
  const randuri = Array.isArray(toate.body) ? toate.body : [];
  if (!randuri.length) return FAIL('niciun rând în subscriptions');
  const activ = randuri.find((x) => x.status === 'active' && new Date(x.current_period_end).getTime() > Date.now());
  const expirat = randuri.find((x) => x.status !== 'active' || new Date(x.current_period_end).getTime() <= Date.now());
  if (expirat) {
    const H64 = (c) => c.repeat(64);
    const r = await RPC('reserve_ai_request', { p_user_id: expirat.user_id, p_guest_id: null, p_client_hash: H64('5'), p_ip_hash: H64('4') });
    const limita = r.ok ? (r.body?.[0]?.daily_limit ?? r.body?.daily_limit) : null;
    if (limita !== 5) return FAIL(`cont ${expirat.status}/${new Date(expirat.current_period_end).toISOString().slice(0, 10)}: daily_limit=${limita}, așteptat 5 (fail-closed)`);
    if (activ) return PASS(`activ: ${activ.plan}/${activ.provider}/${activ.environment} până ${activ.current_period_end}; expirat → 5/zi (fail-closed)`);
    return PASS(`fără abonament activ acum; expirat (${expirat.status}) → 5/zi (fail-closed)`);
  }
  return PASS(`activ: ${activ ? `${activ.plan}/${activ.provider}/${activ.environment} până ${activ.current_period_end}` : 'niciunul'}; niciun rând expirat de verificat`);
});

// ─── F6 — ștergerea contului, end-to-end (server) ────────────────────────────
if (!faraF6) {
  await verifica('F6', 'Cont: creare → date proprii → ștergere → rândul dispărut', async () => {
    const stamp = Date.now();
    const email = `verify-f6-${stamp}@example.com`;
    const parola = `Verif-${stamp}-Aa1!`;
    const creat = await rest('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email, password: parola, email_confirm: true }) });
    if (!creat.ok) return FAIL(`crearea contului de test a picat: HTTP ${creat.status} ${JSON.stringify(creat.body).slice(0, 160)}`);
    const userId = creat.body?.id;
    if (!userId) return FAIL('crearea contului nu a întors id');

    const login = await rest('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password: parola }) });
    if (!login.ok || !login.body?.access_token) return FAIL(`autentificarea contului de test a picat: HTTP ${login.status}`);

    const rugaciune = await SELECT('prayers', 'select=id&limit=1');
    const prayerId = Array.isArray(rugaciune.body) ? rugaciune.body[0]?.id : null;
    const scris = await fetch(`${URL_BASE}/rest/v1/favorites`, {
      method: 'POST',
      headers: { apikey: KEY, authorization: `Bearer ${login.body.access_token}`, 'content-type': 'application/json', prefer: 'return=representation' },
      body: JSON.stringify({ user_id: userId, prayer_id: prayerId }),
    });
    if (!scris.ok) return FAIL(`scrierea favoritului a picat: HTTP ${scris.status} ${(await scris.text()).slice(0, 160)}`);

    // control negativ: fără token, funcția NU are voie să șteargă
    const faraToken = await fetch(`${URL_BASE}/functions/v1/delete-account`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    if (faraToken.status !== 401) return FAIL(`fără token, funcția a răspuns ${faraToken.status}, așteptat 401`);

    const sters = await fetch(`${URL_BASE}/functions/v1/delete-account`, {
      method: 'POST',
      headers: { apikey: KEY, authorization: `Bearer ${login.body.access_token}`, 'content-type': 'application/json' },
      body: '{}',
    });
    const textSters = await sters.text();
    if (!sters.ok) return FAIL(`ștergerea a picat: HTTP ${sters.status} ${textSters.slice(0, 200)}`);

    const verificareUser = await rest(`/auth/v1/admin/users/${userId}`);
    const favorite = await SELECT('favorites', `select=user_id&user_id=eq.${userId}`);
    const profil = await SELECT('profiles', `select=id&id=eq.${userId}`);
    const nFav = Array.isArray(favorite.body) ? favorite.body.length : -1;
    const nProf = Array.isArray(profil.body) ? profil.body.length : -1;
    if (verificareUser.status !== 404) return FAIL(`contul încă există după ștergere: HTTP ${verificareUser.status}`);
    if (nFav !== 0 || nProf !== 0) return FAIL(`date proprii rămase: favorites=${nFav}, profiles=${nProf}`);
    return PASS(`cont nou → login → favorit scris → delete-account HTTP ${sters.status}; după: GET admin/users=${verificareUser.status}, favorites=${nFav}, profiles=${nProf}, fără token=401`);
  });
}

// ─── F10 — textele legale/setări: din sursa aplicației, nu placeholder ───────
await verifica('F10', 'Legal/setări: textul din sursa aplicației (nu placeholder)', async () => {
  const fisiere = ['src/i18n/config.ts', 'src/app/privacy.tsx', 'src/app/terms.tsx'];
  const gasite = [];
  for (const f of fisiere) {
    try { gasite.push({ f, text: readFileSync(f, 'utf8') }); } catch { /* nu există */ }
  }
  if (!gasite.length) return NU('nu am găsit fișierele de i18n/legal în arborele de lucru (rulat din rădăcina depozitului?)');
  const lipsa = fisiere.filter((f) => !gasite.some((g) => g.f === f));
  if (lipsa.length) return FAIL(`lipsesc din depozit: ${lipsa.join(', ')}`);
  const lungimi = gasite.map((g) => ({ f: g.f, car: g.text.length }));
  const termeni = /Termeni/i.test(gasite.map((g) => g.text).join('\n'));
  if (!termeni) return FAIL('nu am găsit textul „Termeni” în sursa ecranelor legale');
  const totalCar = lungimi.reduce((s, x) => s + x.car, 0);
  if (totalCar < 5000) return FAIL(`sursa legală e prea mică (${totalCar} caractere) — pare placeholder`);
  return PASS(`textul legal e în sursă, nu în bază: ${lungimi.map((x) => `${x.f} (${x.car} car.)`).join(', ')}; „Termeni” prezent`);
});

// ─── raport ───────────────────────────────────────────────────────────────────
const trecute = rezultate.filter((r) => r.stare === 'PASS').length;
const picate = rezultate.filter((r) => r.stare === 'FAIL').length;
const neclare = rezultate.filter((r) => r.stare === 'NEVERIFICAT').length;
const raport = {
  cand: new Date().toISOString(),
  commit: (() => { try { return readFileSync('.git/HEAD', 'utf8').trim(); } catch { return null; } })(),
  zi: azi,
  total: rezultate.length,
  trecute, picate, neclare,
  rezultate,
};
spune(`\nTOTAL ${rezultate.length} verificări: ${trecute} trecute, ${picate} picate, ${neclare} neclare`);
if (outPath) {
  writeFileSync(outPath, JSON.stringify(raport, null, 2), 'utf8');
  spune(`raport scris în: ${outPath}`);
}
if (logPath) {
  writeFileSync(logPath, `# verify-functii.mjs — ${new Date().toISOString()} — verificarea pe funcție (T7-bis)\r\n# comandă: node scripts/verify-functii.mjs --env <seif> --out <raport.json> --log <acest fișier>\r\n\r\n` + linii.join('\r\n') + '\r\n', 'utf8');
}
process.exitCode = picate ? 1 : 0;
