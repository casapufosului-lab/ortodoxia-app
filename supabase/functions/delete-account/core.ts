/**
 * Secvența de ștergere a datelor deținute de utilizator, scoasă din handler într-un modul PUR.
 *
 * De ce: poziția C12 din audit a arătat că `tests/account-deletion.test.mjs` verifică doar TEXTUL
 * funcției (`fn.includes('verse_favorites')`), deci ar trece și dacă ștergerea ar exista doar într-un
 * comentariu, și nu putea prinde o linie de cod lipsă. Cu logica aici, testul o poate EXECUTA cu un
 * client fals care înregistrează fiecare apel și poate dovedi că o linie ștearsă din cod face testul
 * să pice (`scripts/prove-account-deletion-test-fails.mjs`).
 *
 * Reguli de design:
 *   - ZERO importuri la runtime (node poate importa direct `.ts`-ul; tipurile se declară local,
 *     structural, ca `admin` din handlerele Deno să se potrivească fără cast-uri);
 *   - fără `Deno.*`, fără rețea: modulul e determinist și testabil;
 *   - `chat_threads` se citește întâi, ca `chat_messages` să poată fi șters pe `thread_id`.
 */

/** Minimul structural din `PostgrestError` de care avem nevoie. */
export type DeleteAdminError = { message: string; code?: string } | null;

export type DeleteResult = { error: DeleteAdminError };
export type ListResult = { data: Array<{ id: string }> | null; error: DeleteAdminError };

/** Clientul de administrare (service-role), redus la operațiile folosite. */
export type DeleteAdmin = {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): PromiseLike<ListResult>;
    };
    delete(): {
      eq(column: string, value: string): PromiseLike<DeleteResult>;
      in(column: string, values: readonly string[]): PromiseLike<DeleteResult>;
    };
  };
};

export type DeleteOutcome = {
  /** Erori reale: orice altceva decât „tabela nu există" oprește ștergerea contului (HTTP 500). */
  errors: string[];
  /**
   * Tabele inexistente în baza live (cod `42P01` / `PGRST205`). Nu blochează ștergerea contului: nu
   * există rânduri de șters. Sunt raportate explicit, ca o migrație neaplicată să nu treacă drept
   * „șters cu succes" fără să se vadă.
   */
  skipped: string[];
};

/** Coduri Postgres/PostgREST pentru „tabela nu există". */
export const TABLE_MISSING_CODES: readonly string[] = ['42P01', 'PGRST205'];

/** Tabelele șterse EXPLICIT de funcție, în ordinea dependențelor (copiii înaintea părinților). */
export const EXPLICITLY_DELETED_TABLES: readonly string[] = [
  'notification_devices',
  'notification_preferences',
  'chat_messages',
  'chat_threads',
  'favorites',
  'verse_favorites',
  'usage_daily',
  'profiles',
];

/**
 * Tabele care conțin `references auth.users(id)` și NU sunt șterse explicit: se șterg prin cascadă,
 * când pasul final (`admin.auth.admin.deleteUser`) reușește. Fiecare are un motiv scris aici, iar
 * testul verifică programatic că lista rămâne completă.
 */
export const CASCADE_ONLY_TABLES: ReadonlyArray<{ table: string; reason: string }> = [
  {
    table: 'ai_reports',
    reason:
      'Rapoartele de conținut AI: `on delete cascade` pe auth.users, deci dispar la ștergerea contului. ' +
      'Nu sunt șterse explicit pentru ca funcția să nu depindă de o migrație care poate să nu fie încă aplicată live.',
  },
  {
    table: 'subscriptions',
    reason:
      'Ciclul de facturare e ținut de RevenueCat/Apple/Google; rândul conține doar user_id + status și ' +
      'dispare prin cascadă. Ciclul extern rămâne, ca utilizatorul să-și poată gestiona abonamentul.',
  },
];

function classify(table: string, operation: string, error: DeleteAdminError): { error: string | null; skipped: string | null } {
  if (!error) return { error: null, skipped: null };
  const label = `${table}${operation ? `(${operation})` : ''}: ${error.message}`;
  if (error.code && TABLE_MISSING_CODES.includes(error.code)) return { error: null, skipped: label };
  return { error: label, skipped: null };
}

/**
 * Șterge datele utilizatorului. NU șterge contul de autentificare — acela e pasul final, în handler.
 *
 * @returns erorile reale (blochează ștergerea contului) și tabelele inexistente (raportate, nu blocante).
 */
export async function deleteOwnedData(admin: DeleteAdmin, userId: string): Promise<DeleteOutcome> {
  const errors: string[] = [];
  const skipped: string[] = [];
  const record = (table: string, operation: string, error: DeleteAdminError) => {
    const result = classify(table, operation, error);
    if (result.error) errors.push(result.error);
    if (result.skipped) skipped.push(result.skipped);
  };

  // 1. notification_devices (cascadă către notification_deliveries)
  record('notification_devices', '', (await admin.from('notification_devices').delete().eq('user_id', userId)).error);

  // 2. notification_preferences
  record('notification_preferences', '', (await admin.from('notification_preferences').delete().eq('user_id', userId)).error);

  // 3. chat_messages — se șterg pe thread_id, deci avem nevoie întâi de thread-urile utilizatorului.
  const { data: threads, error: threadListErr } = await admin.from('chat_threads').select('id').eq('user_id', userId);
  if (threadListErr) {
    // C11: eroarea de listare era ÎNGHIȚITĂ (`if (!threadListErr && ...)`), iar mesajele rămâneau pe
    // loc până la cascadă. Acum o raportăm: un SELECT care eșuează duce la 500, înainte de ștergerea
    // contului, ca utilizatorul să poată reîncerca.
    record('chat_threads', 'list', threadListErr);
  } else if (threads && threads.length > 0) {
    const threadIds = threads.map((thread) => thread.id);
    record('chat_messages', '', (await admin.from('chat_messages').delete().in('thread_id', threadIds)).error);
  }

  // 4. chat_threads
  record('chat_threads', '', (await admin.from('chat_threads').delete().eq('user_id', userId)).error);

  // 5. favorites (rugăciuni salvate)
  record('favorites', '', (await admin.from('favorites').delete().eq('user_id', userId)).error);

  // 6. verse_favorites (favorite pe versete)
  record('verse_favorites', '', (await admin.from('verse_favorites').delete().eq('user_id', userId)).error);

  // 7. usage_daily (contorul zilnic de AI)
  record('usage_daily', '', (await admin.from('usage_daily').delete().eq('user_id', userId)).error);

  // 8. profiles (cheia e `id`, nu `user_id`)
  record('profiles', '', (await admin.from('profiles').delete().eq('id', userId)).error);

  return { errors, skipped };
}
