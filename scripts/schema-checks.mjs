/**
 * Comparația dintre schema REALĂ a bazei și coloanele de care codul depinde.
 *
 * DE CE EXISTĂ, SEPARAT DE CLI
 * ----------------------------
 * Aproape s-a pierdut o zi pe o problemă pe care un astfel de control o prinde în două secunde:
 * migrația `20260903000100` (care adaugă `last_request_at`) figura ca APLICATĂ în istoricul remote,
 * dar în baza reală coloana lipsea. `reserve_ai_request` răspundea `42703`, iar chatul AI răspundea
 * 500 pentru toți utilizatorii. Istoricul migrațiilor nu este dovada schemei: schema este dovada schemei.
 *
 * Aici stă doar logica pură (fără rețea), ca să poată fi testată cu o schemă-fixture. CLI-ul care aduce
 * specificația reală de la PostgREST este `scripts/schema-drift.mjs`.
 */

/**
 * Coloanele de care depinde backendul, grupate pe tabel. Lista se ține lângă codul care le folosește:
 * `supabase/functions/orthodox-chat/index.ts` (chat + rezervarea de cotă), migrațiile de abonamente
 * și, pentru `ai_reports`, inserarea făcută de ecranul de chat (`src/app/(tabs)/chat.tsx`).
 */
export const REQUIRED_COLUMNS = {
  // Raportările răspunsurilor AI (migrația 20261008000200). Ecranul de chat scrie direct în tabel,
  // deci o coloană lipsă în baza reală înseamnă un buton "Raportează" care eșuează la fiecare apăsare.
  ai_reports: ['user_id', 'reason', 'message_text', 'thread_id', 'app_language', 'status', 'created_at'],
  usage_daily: ['user_id', 'usage_date', 'ai_messages', 'last_request_at', 'updated_at'],
  guest_usage_daily: ['guest_id', 'usage_date', 'ai_messages', 'last_request_at', 'updated_at'],
  ai_client_usage_daily: ['scope', 'client_hash', 'usage_date', 'ai_messages', 'last_request_at', 'updated_at'],
  ai_usage_monthly: ['scope', 'period_start', 'ai_messages', 'message_cap', 'updated_at'],
  subscriptions: ['user_id', 'status', 'plan', 'provider', 'current_period_end'],
  chat_threads: ['id', 'user_id', 'title', 'updated_at'],
  chat_messages: ['id', 'thread_id', 'user_id', 'role', 'content', 'created_at'],
};

/** Funcțiile RPC pe care codul le cheamă (numele expuse de PostgREST). */
export const REQUIRED_RPCS = ['reserve_ai_request', 'set_ai_monthly_cap', 'ai_monthly_status'];

/**
 * Compară specificația PostgREST (`/rest/v1/` cu `Accept: application/openapi+json`) cu lista de mai sus.
 *
 * Întoarce exact ce lipsește: tabele absente, coloane absente, RPC-uri absente. Un rezultat gol înseamnă
 * „schema reală acoperă ce cere codul", nu „schema e corectă în absolut".
 */
export function schemaDrift(spec) {
  const definitions = spec?.definitions ?? {};
  const paths = spec?.paths ?? {};
  const availableRpcs = new Set(
    Object.keys(paths)
      .filter((path) => path.startsWith('/rpc/'))
      .map((path) => path.slice('/rpc/'.length)),
  );

  const missingTables = [];
  const missingColumns = [];
  for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
    const properties = definitions[table]?.properties;
    if (properties === undefined || properties === null) {
      missingTables.push(table);
      continue;
    }
    const present = new Set(Object.keys(properties));
    for (const column of columns) {
      if (!present.has(column)) missingColumns.push(`${table}.${column}`);
    }
  }

  const missingRpcs = REQUIRED_RPCS.filter((name) => !availableRpcs.has(name));

  return {
    missingTables,
    missingColumns,
    missingRpcs,
    ok: missingTables.length === 0 && missingColumns.length === 0 && missingRpcs.length === 0,
  };
}

/** Rezumatul citibil al unui rezultat de drift (folosit de CLI și de teste). */
export function schemaDriftSummary(drift) {
  const parts = [];
  if (drift.missingTables.length > 0) parts.push(`tabele lipsă: ${drift.missingTables.join(', ')}`);
  if (drift.missingColumns.length > 0) parts.push(`coloane lipsă: ${drift.missingColumns.join(', ')}`);
  if (drift.missingRpcs.length > 0) parts.push(`funcții lipsă: ${drift.missingRpcs.join(', ')}`);
  return parts.length === 0 ? 'schema reală acoperă tot ce cere codul' : parts.join(' · ');
}
