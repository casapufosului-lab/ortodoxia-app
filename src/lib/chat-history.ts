/**
 * B2 (registru, high) — „istoricul de chat al utilizatorului neautentificat nu se șterge niciodată".
 *
 * Clientul Supabase creează pentru oaspete o sesiune ANONIMĂ reală (`signInAnonymously`), deci
 * transcrierea unui om fără cont stă sub un `auth.users.id` adevărat. `delete-account` șterge doar
 * contul autentificat, iar oaspetele nu avea nicio cale prin care să-și șteargă conversația.
 * Modulul de față dă exact acea cale: ștergerea firelor de conversație ale sesiunii CURENTE.
 *
 * De ce se șterg doar firele, nu și mesajele: `chat_messages` are politici RLS doar pentru `select`
 * și `insert` (vezi `supabase/migrations/20260829000100_initial_schema.sql`), deci o ștergere directă
 * din client ar fi refuzată. Legătura `chat_messages.thread_id → chat_threads.id` are însă
 * `on delete cascade`, deci mesajele pleacă o dată cu firul — verificat de
 * `tests/chat-history-deletion.test.mjs`.
 *
 * Modulul e intenționat PUR (fără React Native, fără expo, fără client concret), ca să poată fi rulat
 * în teste sub Node pe un client fals și să nu poată fi ocolit de vreun ecran anume.
 *
 * Ce NU face și de ce: nu șterge datele altcuiva. Identitatea vine exclusiv din sesiune, iar funcția
 * are un singur parametru, ca să nu existe portiță pentru un `userId` din afară (RLS ar refuza oricum,
 * dar contractul e mai strict decât baza).
 */

export type ChatHistorySession = { user: { id: string } | null } | null;

export type ChatHistoryDeletionResult = {
  /** `false` când nu există sesiune: nu era nimic de șters, dar nici nu e o eroare. */
  hadSession: boolean;
  deletedThreads: number;
};

/** Forma minimă de care are nevoie modulul, ca testele să poată folosi un client fals. */
export type ChatHistoryClient = {
  auth: {
    getSession(): PromiseLike<{ data: { session: ChatHistorySession } }>;
  };
  from(table: string): {
    delete(): {
      eq(
        column: string,
        value: string,
      ): {
        select(columns?: string): PromiseLike<{
          data: { id?: string }[] | null;
          error: { message: string; code?: string } | null;
        }>;
      };
    };
  };
};

export class ChatHistoryDeletionError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null = null) {
    super(message);
    this.name = 'ChatHistoryDeletionError';
    this.code = code;
  }
}

/**
 * Șterge istoricul sesiunii curente (oaspete sau cont) și întoarce câte fire au dispărut.
 *
 * Motivul pentru care nu aruncă atunci când nu există sesiune: un oaspete care nu a trimis niciodată
 * un mesaj nu are fir, iar o eroare vizibilă pentru „nu era nimic de șters" ar fi o minciună.
 */
export async function deleteChatHistoryForSession(
  client: ChatHistoryClient,
): Promise<ChatHistoryDeletionResult> {
  const { data } = await client.auth.getSession();
  const userId = data?.session?.user?.id ?? null;

  if (!userId) {
    return { hadSession: false, deletedThreads: 0 };
  }

  const { data: deleted, error } = await client
    .from('chat_threads')
    .delete()
    .eq('user_id', userId)
    .select('id');

  if (error) {
    // Ștergerea care nu ajunge nicăieri trebuie SPUSĂ, nu înghițită: omul a cerut ceva, iar ecranul
    // are nevoie de motiv ca să afișeze „nu s-a putut".
    throw new ChatHistoryDeletionError(error.message, error.code ?? null);
  }

  return { hadSession: true, deletedThreads: deleted?.length ?? 0 };
}

/**
 * Butonul de ștergere are sens doar când există o conversație: un fir salvat sau măcar un mesaj
 * scris de om. `messages` conține și mesajul de bun venit al asistentului, care NU e istoric.
 */
export function shouldOfferChatHistoryDeletion(
  messages: { role: string }[],
  threadId: string | null,
): boolean {
  if (threadId) return true;
  return messages.some((message) => message.role === 'user');
}
