/** Stable error codes for known account-deletion failure cases. */
export type AccountDeletionErrorCode = 'AUTH_REQUIRED' | 'SERVICE_UNAVAILABLE' | 'DELETE_FAILED' | 'TIMEOUT';

/**
 * Ceiling for the deletion request. The Edge Function walks several tables before
 * deleting the auth user, so this is generous, but it must exist: a stalled
 * connection previously left the UI in a permanent busy state.
 */
const ACCOUNT_DELETION_TIMEOUT_MS = 60_000;

/**
 * Error thrown by {@link requestAccountDeletion} for known failure cases.
 * The `code` property identifies the failure type so the UI layer can map it
 * to a localized message via i18n. Dynamic backend errors are thrown as plain
 * `Error` objects with the raw message.
 */
export class AccountDeletionError extends Error {
  readonly code: AccountDeletionErrorCode;
  constructor(code: AccountDeletionErrorCode) {
    super(code);
    this.code = code;
    this.name = 'AccountDeletionError';
  }
}

/**
 * Invoke the `delete-account` Edge Function.
 *
 * The Edge Function derives the target user ID **only** from the verified
 * JWT in the Authorization header. The request body is intentionally empty.
 *
 * @throws {AccountDeletionError} with a stable code for known failure cases.
 * @throws {Error} with the backend error message for unknown failures.
 */
export async function requestAccountDeletion(): Promise<void> {
  // Dynamic import avoids bundling Supabase at the top level for tree-shaking.
  const { supabase } = await import('@/lib/supabase');

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new AccountDeletionError('AUTH_REQUIRED');
  }

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new AccountDeletionError('SERVICE_UNAVAILABLE');
  }

  // Account deletion can take several seconds server-side (it walks every
  // user-owned table before deleting the auth user). A timeout is still required:
  // without one a stalled connection left the delete button showing its spinner
  // indefinitely, with no retry and no way to tell whether the account was removed.
  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/functions/v1/delete-account`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(ACCOUNT_DELETION_TIMEOUT_MS),
    });
  } catch (error) {
    // A TimeoutError means the request was aborted by our own signal; anything
    // else is a transport failure. Both are reported distinctly so the UI can tell
    // the user whether the account may have been deleted.
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new AccountDeletionError('TIMEOUT');
    }
    throw new AccountDeletionError('SERVICE_UNAVAILABLE');
  }

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (typeof body.error === 'string') {
      throw new Error(body.error);
    }
    throw new AccountDeletionError('DELETE_FAILED');
  }
}
