/** Stable error codes for known account-deletion failure cases. */
export type AccountDeletionErrorCode = 'AUTH_REQUIRED' | 'SERVICE_UNAVAILABLE' | 'DELETE_FAILED';

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

  const response = await fetch(`${supabaseUrl}/functions/v1/delete-account`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
      'Content-Type': 'application/json',
    },
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (typeof body.error === 'string') {
      throw new Error(body.error);
    }
    throw new AccountDeletionError('DELETE_FAILED');
  }
}
