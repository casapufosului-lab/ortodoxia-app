/**
 * Invoke the `delete-account` Edge Function.
 *
 * The Edge Function derives the target user ID **only** from the verified
 * JWT in the Authorization header. The request body is intentionally empty.
 *
 * @throws {Error} with a user-friendly Romanian message on failure.
 */
export async function requestAccountDeletion(): Promise<void> {
  // Dynamic import avoids bundling Supabase at the top level for tree-shaking.
  const { supabase } = await import('@/lib/supabase');

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Autentificare necesară. Conectează-te din nou.');
  }

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error('Serviciul nu este configurat. Încearcă mai târziu.');
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
    const message = typeof body.error === 'string' ? body.error : 'Contul nu a putut fi șters. Încearcă din nou.';
    throw new Error(message);
  }
}
