/**
 * Control de derivă a schemei REALE față de coloanele cerute de cod.
 *
 *   npm run db:drift
 *
 * De ce: istoricul migrațiilor spune ce S-A CERUT, nu ce EXISTĂ. În producție, coloana
 * `usage_daily.last_request_at` lipsea deși migrația care o adaugă era marcată aplicată — chatul AI
 * răspundea 500 pentru toți utilizatorii. Scriptul de față compară specificația reală a PostgREST cu
 * lista din `scripts/schema-checks.mjs` și iese cu eroare la orice diferență.
 *
 * Cere două variabile de mediu (cheia de service NU se pune în fișiere din depozit):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Rulare locală, cu valorile proiectului:
 *   $env:SUPABASE_URL="https://<ref>.supabase.co"; $env:SUPABASE_SERVICE_ROLE_KEY="..."; npm run db:drift
 */
import { schemaDrift, schemaDriftSummary } from './schema-checks.mjs';

const url = (process.env.SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();

if (url === '' || serviceKey === '') {
  console.log('NU SE POATE VERIFICA: lipsesc SUPABASE_URL și/sau SUPABASE_SERVICE_ROLE_KEY din mediu.');
  console.log('Cheia de service se ia din Supabase → Project Settings → API și NU se scrie în depozit.');
  process.exit(1);
}

let spec;
try {
  const response = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Accept: 'application/openapi+json' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    console.log(`NU SE POATE VERIFICA: PostgREST a răspuns ${String(response.status)}.`);
    process.exit(1);
  }
  spec = await response.json();
} catch (error) {
  console.log(`NU SE POATE VERIFICA: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const drift = schemaDrift(spec);
console.log(`proiect: ${url}`);
console.log(`rezultat: ${schemaDriftSummary(drift)}`);

if (!drift.ok) {
  console.log('\nSchema reală NU acoperă ce cere codul. Nu presupune că migrațiile au fost aplicate:');
  console.log('verifică `npx supabase migration list --linked`, apoi adaugă o migrație nouă (idempotentă)');
  console.log('care repară diferența — nu rescrie una deja aplicată.');
  process.exit(1);
}

console.log('OK — fiecare tabelă, coloană și funcție cerută de cod există în baza reală.');
