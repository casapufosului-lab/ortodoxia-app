/**
 * Per-client request limiting for the public `live-services-status` endpoint.
 *
 * WHY THIS EXISTS
 * ---------------
 * The function is deployed with `verify_jwt = false` (guests must be able to read
 * public broadcast metadata) and it spends YouTube Data API quota: a `search.list`
 * costs 100 units. The only protection used to be a discovery budget created
 * *inside* the handler, so every request started again with the full allowance —
 * the comment in status.ts claimed it bounded "repeated or hostile calls", which
 * was false across requests (pre-launch audit, item B4).
 *
 * Two bounds now apply:
 *   1. this limiter — one client gets a small number of requests per window, after
 *      which the endpoint answers 429 with `Retry-After`. Exhausting one client's
 *      window never affects another client.
 *   2. the discovery budget in index.ts, which is now day-scoped at module level
 *      (see `createDayScopedDiscoveryBudget`) instead of per request, so repeated
 *      calls cannot restart the allowance.
 *
 * WHAT THIS IS NOT
 * ----------------
 * `x-forwarded-for` is set by the platform but is client-appendable, so a caller
 * that spoofs the header moves itself to a fresh bucket. The address is therefore
 * a cheap abuse throttle, never an identity — and the day-scoped budget stays the
 * hard bound on the quota the whole deployment can spend.
 *
 * When no address can be determined the request is *not* throttled (the budget
 * still applies): sharing one bucket between every unknown-address caller would
 * throttle real users, which is exactly what this limiter must not do.
 */

export const STATUS_WINDOW_MS = 60_000;
export const STATUS_MAX_REQUESTS_PER_WINDOW = 12;
export const STATUS_MAX_TRACKED_CLIENTS = 5_000;

export type RateLimitDecision = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

export type WindowRateLimiter = {
  /** Count one request for `clientKey`; the decision is `allowed: false` past the limit. */
  check(clientKey: string, nowMs: number): RateLimitDecision;
  trackedClients(): number;
};

type Window = { startedAt: number; count: number };

/**
 * Fixed-window counter, one window per client key.
 *
 * Fixed windows are deliberate: they are trivial to reason about, they bound the
 * worst case (maxRequests per window per client) and they cost one Map entry.
 * `maxTrackedClients` bounds memory — the oldest windows are evicted first, so a
 * caller cannot grow the map without limit.
 */
export function createWindowRateLimiter(
  maxRequests = STATUS_MAX_REQUESTS_PER_WINDOW,
  windowMs = STATUS_WINDOW_MS,
  maxTrackedClients = STATUS_MAX_TRACKED_CLIENTS,
): WindowRateLimiter {
  const windows = new Map<string, Window>();

  function dropExpired(nowMs: number): void {
    for (const [key, window] of windows) {
      if (nowMs - window.startedAt >= windowMs) windows.delete(key);
    }
  }

  /** Keeps the map at or below `maxTrackedClients`, evicting the oldest windows. */
  function enforceBound(): void {
    if (windows.size <= maxTrackedClients) return;
    const byAge = [...windows.entries()].sort((a, b) => a[1].startedAt - b[1].startedAt);
    for (let i = 0; i < byAge.length - maxTrackedClients; i++) windows.delete(byAge[i][0]);
  }

  return {
    check(clientKey: string, nowMs: number): RateLimitDecision {
      dropExpired(nowMs);
      let window = windows.get(clientKey);
      if (!window) {
        window = { startedAt: nowMs, count: 0 };
        windows.set(clientKey, window);
      }
      window.count += 1;
      enforceBound();
      const elapsedMs = nowMs - window.startedAt;
      return {
        allowed: window.count <= maxRequests,
        limit: maxRequests,
        remaining: Math.max(0, maxRequests - window.count),
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((windowMs - elapsedMs) / 1000),
        ),
      };
    },
    trackedClients(): number {
      return windows.size;
    },
  };
}

export type HeaderReader = { get(name: string): string | null };

/**
 * Client address as reported by the platform, or `null` when there is none.
 *
 * Only the first `x-forwarded-for` hop is used, matching the rest of the backend
 * (see orthodox-chat). `cf-connecting-ip` / `x-real-ip` are the platform fallbacks.
 */
export function clientAddress(headers: HeaderReader): string | null {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const direct = (headers.get('cf-connecting-ip') ?? headers.get('x-real-ip') ?? '').trim();
  return direct.length > 0 ? direct : null;
}
