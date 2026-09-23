/**
 * Shared CORS and secret-comparison helpers for the Supabase Edge Functions.
 *
 * WHY THIS EXISTS
 * ---------------
 * Every function declared `Access-Control-Allow-Origin: '*'`, which lets any web origin
 * call it from a browser. The mobile app is not a browser and sends no `Origin` header,
 * so a wildcard was never needed for the app itself — only for local development. A
 * production deployment should answer with the concrete origins it trusts.
 *
 * Two secrets were also compared with `!==`, which short-circuits on the first differing
 * character and so leaks a timing hint about the expected value. The RevenueCat webhook
 * already compared in constant time; this module gives the cron and prayer-audio
 * endpoints the same guarantee from one place.
 */

/**
 * Origins allowed to call these functions from a browser.
 *
 * Read from the `ALLOWED_ORIGINS` function secret (comma-separated). While it is unset
 * the helper falls back to `*`, so behaviour is unchanged until an operator opts in and
 * a native client — which never sends `Origin` — is unaffected either way.
 *
 * Called on every request rather than cached at module scope so a rotated value in the
 * running isolate is picked up.
 */
export function allowedOrigin(requestOrigin?: string | null): string {
  const configured = typeof Deno !== 'undefined'
    ? (Deno.env.get('ALLOWED_ORIGINS') ?? '').trim()
    : '';

  if (configured.length === 0) return '*';

  const allowed = configured
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (allowed.length === 0) return '*';

  if (requestOrigin && allowed.includes(requestOrigin)) return requestOrigin;
  // A disallowed or absent origin receives the first configured value, so a browser
  // refuses the response. A native client ignores CORS entirely.
  return allowed[0];
}

/**
 * Response headers for a request.
 *
 * Shaped like the `corsHeaders` object it replaces, so a call site only has to pass
 * `req` and keep spreading the result.
 */
export function corsHeaders(
  req: Request,
  allowedHeaders: string,
): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': allowedOrigin(req.headers.get('origin')),
    'Access-Control-Allow-Headers': allowedHeaders,
    // Required so a cache cannot serve a response computed for another origin.
    Vary: 'Origin',
  };
}

/**
 * Preflight response.
 *
 * An OPTIONS preflight carries the `Origin` header, so the same origin logic applies.
 */
export function preflightResponse(req: Request, allowedHeaders: string): Response {
  return new Response('ok', { headers: corsHeaders(req, allowedHeaders) });
}

/**
 * Constant-time string comparison.
 *
 * Length may short-circuit (for these fixed-size tokens the length is not usefully
 * secret) and the content comparison accumulates differences without branching, so the
 * running time does not reveal how many leading characters matched.
 */
export function timingSafeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}
