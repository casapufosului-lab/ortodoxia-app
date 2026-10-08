/**
 * Regula din 08.10.2026 (itemul „d" al rundei de lansare): în Supabase,
 * `revoke execute on function ... from public` **nu** scoate privilegiile rolurilor `anon` /
 * `authenticated` — ele primesc EXECUTE prin `PUBLIC`. O funcție `security definer` care lucrează pe
 * date de utilizator trebuie să aibă, în aceeași migrare,
 * `revoke ... from public, anon, authenticated`.
 *
 * Dovada live care a produs regula: `POST /rest/v1/rpc/purge_guest_chat_history` cu cheia publicabilă
 * răspundea 200 (ștergere pornită de orice client anonim), iar după revoke răspunde 401
 * `permission denied for function`.
 *
 * Testul îngheață cele 15 definiții `security definer` din 11 migrări anterioare datei, care nu au
 * revoke în fișier; pică dacă apare o definiție nouă fără revoke. Al treilea test verifică că
 * detectorul chiar poate pica (altfel testul 1 ar putea trece „verde" cu un regex stricat).
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations');

/** Înghețat 08.10.2026: definiții `security definer` fără revoke în același fișier. */
const BASELINE = {
  '20260829000100_initial_schema.sql': 1,
  '20260902000200_add_notification_idempotency.sql': 2,
  '20260903000100_harden_ai_usage.sql': 1,
  '20260907000100_fix_ai_request_reservation.sql': 1,
  '20260909000200_harden_revenuecat_subscription_sync.sql': 1,
  '20260909000300_claim_notification_device.sql': 1,
  '20260909000400_fix_chat_cooldown_contract.sql': 1,
  '20260915000200_harden_notification_device_claim.sql': 1,
  '20260915000300_fail_closed_expiry_and_provider_provenance.sql': 2,
  '20260923000100_add_client_and_monthly_ai_caps.sql': 3,
  '20261008000300_retention_guest_chat.sql': 1,
};

const CREATION = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z_][a-z0-9_]*)\s*\(/gi;

/** Definițiile de funcții din SQL, fiecare cu atributul `security definer` citit din antetul propriu. */
export function definerFunctions(sql) {
  const matches = [...sql.matchAll(CREATION)];
  return matches.map((match, index) => {
    const end = index + 1 < matches.length ? matches[index + 1].index : sql.length;
    const header = sql.slice(match.index, end).split('$$')[0];
    return { name: match[1].toLowerCase(), definer: /security\s+definer/i.test(header) };
  });
}

/** Există, în același fișier, un revoke care numește funcția și vizează public/anon/authenticated? */
export function hasRevoke(sql, name) {
  return new RegExp(
    `revoke\\b[^;]*\\b${name}\\b[^;]*\\bfrom\\b[^;]*\\b(public|anon|authenticated)\\b`,
    'i',
  ).test(sql);
}

const migrationFiles = readdirSync(MIGRATIONS)
  .filter((file) => file.endsWith('.sql'))
  .sort();

test('1. nicio definiție security definer nouă fără revoke în aceeași migrare', () => {
  const found = {};
  let definerTotal = 0;
  for (const file of migrationFiles) {
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8');
    const definers = definerFunctions(sql).filter((fn) => fn.definer);
    definerTotal += definers.length;
    const missing = definers.filter((fn) => !hasRevoke(sql, fn.name));
    if (missing.length > 0) found[file] = missing.length;
  }
  assert.ok(
    definerTotal >= 15,
    `detectorul a găsit doar ${definerTotal} definiții security definer — verifică parserul, nu înghețul`,
  );
  for (const [file, count] of Object.entries(found)) {
    const frozen = BASELINE[file] ?? 0;
    assert.ok(
      count <= frozen,
      `${file}: ${count} definiții security definer fără revoke (max înghețat: ${frozen}) — scrie ` +
        '`revoke all on function public.<nume>(...) from public, anon, authenticated;` în aceeași migrare',
    );
  }
});

test('2. înghețul se referă la fișiere care încă există', () => {
  for (const file of Object.keys(BASELINE)) {
    assert.ok(migrationFiles.includes(file), `migrarea din îngheț nu mai există: ${file}`);
  }
});

test('3. detectorul poate pica: același corp, cu și fără revoke', () => {
  const faraRevoke = [
    'create or replace function public.exemplu_verificat(p_id uuid)',
    'returns void language plpgsql security definer set search_path = public',
    'as $$ begin delete from public.exemplu_verificat where id = p_id; end $$;',
  ].join('\n');
  const cuRevoke = `${faraRevoke}\nrevoke all on function public.exemplu_verificat(p_id uuid) from public, anon, authenticated;`;
  const simpla = 'create function public.fara_definer() returns int language sql as $$ select 1 $$;';

  const lipsa = (sql) =>
    definerFunctions(sql).filter((fn) => fn.definer && !hasRevoke(sql, fn.name)).length;

  assert.equal(lipsa(faraRevoke), 1, 'fără revoke, detectorul trebuie să raporteze o lipsă');
  assert.equal(lipsa(cuRevoke), 0, 'cu revoke, detectorul nu mai raportează nimic');
  assert.equal(
    definerFunctions(simpla)[0].definer,
    false,
    'o funcție fără security definer nu intră în regulă',
  );
  assert.equal(
    hasRevoke(`${faraRevoke}\nrevoke all on function public.exemplu_verificat(p_id uuid) from public;`, 'exemplu_verificat'),
    true,
    'un revoke care numește funcția e detectat; regula cere însă explicit și `anon, authenticated`',
  );
});
