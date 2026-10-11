/**
 * Supabase Edge Function: live-player-diagnostic
 *
 * The one channel that can close the black-screen question (builds 11-19) WITHOUT a photo: the app
 * posts the very values it prints under the player, so the answer can be read straight out of the
 * database instead of off a phone screen.
 *
 * POST /live-player-diagnostic  → 204 No Content on success
 *
 * WHY A SERVER-SIDE ENDPOINT AND NOT A DIRECT INSERT
 * --------------------------------------------------
 * The table has RLS on and NO policy, so anon/authenticated cannot read or write it at all. This
 * function is the only writer, and it holds `service_role` (a secret that must never reach the
 * app). That is also why the body is validated strictly before it ever reaches the table: the
 * endpoint is reachable by anyone who has the public key, so an unchecked body would be an open
 * write into our database.
 *
 * WHAT IS ACCEPTED (build 20.1 field names, the same ones printed on screen)
 * ------------------------------------------------------------------------
 *   video_id, page_url, http_status, error_text, referrer, video_size, webview_size,
 *   page_text, app_version, device        → strings, each at most 2 KB (UTF-8 bytes)
 *   loaded                                → boolean
 *   user_id                               → UUID or null (the app sends null today)
 * Anything else is refused with 400: unknown fields are how a payload smuggles data we never
 * agreed to store.
 *
 * WHAT IS LOGGED: the video id and the response code, nothing else. The body may contain the
 * page's visible text, so it is never echoed into logs and never echoed back in an error message.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

import { corsHeaders, createJsonResponder, preflightResponse } from '../_shared/http.ts';

const ALLOWED_HEADERS = 'authorization, x-client-info, apikey, content-type';

const TABLE = 'live_player_diagnostics';

/** Per-field and whole-body bounds. Ordered limits, so the tuple is stated once, here. */
const MAX_FIELD_BYTES = 2048;
const MAX_BODY_BYTES = 4096;
const MAX_VIDEO_ID_LENGTH = 64;

const TEXT_FIELDS = [
  'video_id',
  'page_url',
  'http_status',
  'error_text',
  'referrer',
  'video_size',
  'webview_size',
  'page_text',
  'app_version',
  'device',
] as const;

const KNOWN_FIELDS: ReadonlySet<string> = new Set<string>([...TEXT_FIELDS, 'loaded', 'user_id']);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

/**
 * A window counter per isolate.
 *
 * The endpoint is public by necessity (the phone has no secret to prove who it is), so a cheap
 * ceiling keeps one client from filling the table. It is deliberately tiny: the app sends at most
 * three reports per opening, so even a burst of real traffic stays far below this. NOT a security
 * boundary - a defence against accidents and casual abuse, and it fails open (each isolate counts
 * on its own) rather than closed, because losing a diagnostic is worse than accepting one extra
 * request.
 */
const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60_000;
let rateWindowStart = Date.now();
let rateWindowCount = 0;

function rateLimited(): boolean {
  const now = Date.now();
  if (now - rateWindowStart >= RATE_LIMIT_WINDOW_MS) {
    rateWindowStart = now;
    rateWindowCount = 0;
  }
  rateWindowCount += 1;
  return rateWindowCount > RATE_LIMIT_MAX;
}

/** The validated row, ready for the insert. */
type DiagnosticRow = {
  video_id: string;
  page_url: string | null;
  http_status: string | null;
  error_text: string | null;
  referrer: string | null;
  video_size: string | null;
  webview_size: string | null;
  loaded: boolean | null;
  page_text: string | null;
  app_version: string | null;
  device: string | null;
  user_id: string | null;
};

/**
 * Strict validation. Returns either the row to insert or a machine-readable reason.
 *
 * Every check is fail-closed and every message is free of the offending content, so a refusal can
 * be logged without copying page text around.
 */
function validate(body: unknown): { row: DiagnosticRow } | { reason: string } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { reason: 'body_not_object' };
  }

  const record = body as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!KNOWN_FIELDS.has(key)) return { reason: 'unknown_field' };
  }

  const text: Partial<Record<(typeof TEXT_FIELDS)[number], string | null>> = {};
  for (const field of TEXT_FIELDS) {
    const value = record[field];
    if (value === undefined || value === null) {
      text[field] = null;
      continue;
    }
    if (typeof value !== 'string') return { reason: 'field_not_string' };
    if (byteLength(value) > MAX_FIELD_BYTES) return { reason: 'field_too_long' };
    // Control characters other than tab/newline would let a payload smuggle separators into a log
    // or a future export; they are refused rather than stripped, so a client is never surprised by
    // a silently altered value.
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) {
      return { reason: 'field_control_characters' };
    }
    text[field] = value;
  }

  const videoId = (text.video_id ?? '').trim();
  if (videoId.length === 0 || videoId.length > MAX_VIDEO_ID_LENGTH) {
    return { reason: 'video_id_invalid' };
  }

  const loaded = record.loaded;
  if (loaded !== undefined && loaded !== null && typeof loaded !== 'boolean') {
    return { reason: 'loaded_not_boolean' };
  }

  const userId = record.user_id;
  if (userId !== undefined && userId !== null) {
    if (typeof userId !== 'string' || !UUID_PATTERN.test(userId)) {
      return { reason: 'user_id_not_uuid' };
    }
  }

  return {
    row: {
      video_id: videoId,
      page_url: text.page_url ?? null,
      http_status: text.http_status ?? null,
      error_text: text.error_text ?? null,
      referrer: text.referrer ?? null,
      video_size: text.video_size ?? null,
      webview_size: text.webview_size ?? null,
      loaded: typeof loaded === 'boolean' ? loaded : null,
      page_text: text.page_text ?? null,
      app_version: text.app_version ?? null,
      device: text.device ?? null,
      user_id: typeof userId === 'string' ? userId : null,
    },
  };
}

Deno.serve(async (req: Request) => {
  // C17: the responder is bound to this request, never to a module variable.
  const json = createJsonResponder(req, ALLOWED_HEADERS);
  if (req.method === 'OPTIONS') return preflightResponse(req, ALLOWED_HEADERS);
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  if (rateLimited()) return json({ error: 'too_many_requests' }, 429);

  const raw = await req.text();
  if (byteLength(raw) > MAX_BODY_BYTES) return json({ error: 'body_too_large' }, 400);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const validated = validate(parsed);
  if ('reason' in validated) {
    console.warn(`live-player-diagnostic: refused request (${validated.reason})`);
    return json({ error: 'invalid_body' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('live-player-diagnostic: server is not configured (missing service credentials)');
    return json({ error: 'server_not_configured' }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await admin.from(TABLE).insert(validated.row);
  if (error) {
    // The video id and the outcome only: the body may hold the page's own text.
    console.error(`live-player-diagnostic: insert failed for video_id=${validated.row.video_id}`);
    return json({ error: 'insert_failed' }, 500);
  }

  // Only the video id and the code, never the content.
  console.log(`live-player-diagnostic: stored video_id=${validated.row.video_id} status=204`);

  // 204: nothing to say to the client. The app treats any reply as final and never retries.
  return new Response(null, { status: 204, headers: corsHeaders(req, ALLOWED_HEADERS) });
});
