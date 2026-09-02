/**
 * Drift-consistency tests for the live-services-status backend.
 *
 * Ensures the server-side canonical source list (supabase/functions/
 * live-services-status/sources.ts) stays in sync with the canonical client
 * registry (src/live/live-services.ts) from LIVE-A, and that the cache
 * migration + config.toml are correctly hardened.
 *
 * Run:
 *   node --experimental-strip-types --test supabase/functions/live-services-status/tests/*.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fnDir = join(__dirname, '..');
const root = join(fnDir, '..', '..', '..');

const clientSrc = readFileSync(join(root, 'src/live/live-services.ts'), 'utf8');
const serverSrc = readFileSync(join(fnDir, 'sources.ts'), 'utf8');
const migrationSql = readFileSync(
  join(root, 'supabase/migrations/20260902100000_add_live_service_status_cache.sql'),
  'utf8',
);
const configToml = readFileSync(join(root, 'supabase/config.toml'), 'utf8');
const envExample = readFileSync(join(root, '.env.example'), 'utf8');

// Extract the server-side canonical list via the imported module.
const { LIVE_SOURCES } = await import(pathToFileURL(join(fnDir, 'sources.ts')));

function extractClientSources(src) {
  const objects = [];
  const idRe = /\n\s*\{\s*\n\s*id:\s*'([^']+)'/g;
  let m;
  while ((m = idRe.exec(src)) !== null) {
    const start = m.index;
    const end = src.indexOf('\n  },', start);
    if (end === -1) continue;
    objects.push({ id: m[1], block: src.slice(start, end + 4) });
  }
  return objects;
}

function getField(block, field) {
  // String values (quoted) or booleans.
  const str = block.match(new RegExp(`${field}:\\s*'([^']*)'`));
  if (str) return str[1];
  const bool = block.match(new RegExp(`${field}:\\s*(true|false)`));
  if (bool) return bool[1];
  return undefined;
}

test('server-side sources match the LIVE-A canonical client registry', () => {
  const clientEntries = extractClientSources(clientSrc);
  const serverEntries = Array.from(LIVE_SOURCES);

  assert.equal(
    clientEntries.length,
    serverEntries.length,
    'source count must match between client and server registries',
  );

  const byId = new Map(serverEntries.map((s) => [s.id, s]));
  for (const entry of clientEntries) {
    const server = byId.get(entry.id);
    assert.ok(server, `server registry missing source ${entry.id}`);
    assert.equal(
      server.officialChannelId,
      getField(entry.block, 'officialChannelId') ?? '',
      `channelId mismatch for ${entry.id}`,
    );
    const clientEnabled = entry.block.includes('enabled: true');
    assert.equal(server.enabled, clientEnabled, `enabled mismatch for ${entry.id}`);
  }
});

test('server source list has no videoId field (transient data never permanent)', () => {
  // The word videoId may appear in comments; the registry must never ASSIGN it.
  assert.ok(!serverSrc.match(/videoId\s*:/), 'permanent server sources must not assign videoId');
  assert.ok(!serverSrc.includes('current_video_id'), 'no transient column in permanent config');
});

test('migration creates live_service_status_cache with required columns', () => {
  const normalized = migrationSql.replace(/\s+/g, ' ');
  assert.ok(normalized.includes('create table public.live_service_status_cache ('));
  assert.ok(normalized.includes('source_id text primary key'));
  assert.ok(normalized.includes("status text not null check (status in ('live', 'not_live', 'unknown'))"));
  assert.ok(normalized.includes('current_video_id text'));
  assert.ok(normalized.includes('current_title text'));
  assert.ok(normalized.includes('embeddable boolean'));
  assert.ok(normalized.includes('checked_at timestamptz'));
  assert.ok(normalized.includes('next_refresh_at timestamptz'));
  assert.ok(normalized.includes('refresh_lease_until timestamptz'));
  assert.ok(normalized.includes('updated_at timestamptz'));
});

test('migration enables RLS on the cache table', () => {
  assert.ok(migrationSql.includes('enable row level security'));
});

test('migration blocks ALL client write operations on cache', () => {
  for (const role of ['anon', 'authenticated']) {
    assert.ok(migrationSql.includes(`block_insert_${role}`), `missing insert block for ${role}`);
    assert.ok(migrationSql.includes(`block_update_${role}`), `missing update block for ${role}`);
    assert.ok(migrationSql.includes(`block_delete_${role}`), `missing delete block for ${role}`);
  }
  // 6 × using(false) for select(2) + update(2) + delete(2)
  const usingFalse = (migrationSql.match(/using \(false\)/g) ?? []).length;
  assert.equal(usingFalse, 6, 'expected 6 explicit using(false) denials');
  // 4 × with check(false) for insert(2) + update(2)
  const withCheckFalse = (migrationSql.match(/with check \(false\)/g) ?? []).length;
  assert.equal(withCheckFalse, 4, 'expected 4 explicit with check(false) denials');
});

test('migration does not store raw payloads or secrets', () => {
  const lower = migrationSql.toLowerCase();
  assert.ok(!lower.includes('api key'));
  assert.ok(!lower.includes('secret'));
  assert.ok(!lower.includes('raw'));
});

test('config.toml registers live-services-status function', () => {
  assert.ok(configToml.includes('[functions.live-services-status]'));
  assert.ok(configToml.includes('verify_jwt = false'));
});

test('.env.example does not contain a YouTube API key', () => {
  assert.ok(!envExample.includes('YOUTUBE_DATA_API_KEY'), 'key belongs only in Supabase secrets');
  assert.ok(!envExample.includes('AIza'), 'must not contain any real key value');
});

test('every server source has id, channelId, enabled, supportsDynamicLiveDetection', () => {
  for (const s of LIVE_SOURCES) {
    assert.ok(s.id, 'id required');
    assert.ok(s.officialChannelId.startsWith('UC'), `channel must start with UC: ${s.id}`);
    assert.equal(typeof s.enabled, 'boolean');
    assert.equal(typeof s.supportsDynamicLiveDetection, 'boolean');
  }
});

test('edge function entry uses YOUTUBE_DATA_API_KEY secret server-side only', () => {
  const idx = readFileSync(join(fnDir, 'index.ts'), 'utf8');
  assert.ok(idx.includes("Deno.env.get('YOUTUBE_DATA_API_KEY')"));
  assert.ok(idx.includes("if (!supabaseUrl || !serviceRoleKey)"));
});

test('index.ts never echoes errors verbatim (no raw stack traces)', () => {
  const idx = readFileSync(join(fnDir, 'index.ts'), 'utf8');
  assert.ok(!idx.includes('stack'));
  assert.ok(idx.includes('console.error'), 'errors may be logged, never returned raw');
});

test('YouTube client uses only official documented API endpoints', () => {
  const yt = readFileSync(join(fnDir, 'youtube.ts'), 'utf8');
  assert.ok(yt.includes("'/search'"), 'search.list path');
  assert.ok(yt.includes("'/videos'"), 'videos.list path');
  assert.ok(yt.includes('eventType'), 'eventType param');
  assert.ok(yt.includes('type'), 'type param');
  assert.ok(yt.includes('channelId'), 'channelId param');
  assert.ok(yt.includes('maxResults'), 'maxResults param');
  assert.ok(!yt.includes('watch?v='), 'no watch URLs');
});

test('index.ts does not accept arbitrary channel IDs or URLs from clients', () => {
  const idx = readFileSync(join(fnDir, 'index.ts'), 'utf8');
  // Only known canonical source IDs are accepted (via getSourceById).
  assert.ok(idx.includes('getSourceById(requestedId)'), 'only canonical id filter');
  assert.ok(idx.includes('if (!source)'), 'unknown id rejected');
  // No raw channelId / videoId accepted from the request.
  assert.ok(!idx.includes("searchParams.get('channelId')"), 'no client-supplied channelId');
  assert.ok(!idx.includes("searchParams.get('videoId')"), 'no client-supplied videoId');
  assert.ok(!idx.includes('watch?v='), 'no watch URLs accepted');
});

test('lease claim seeds a baseline row before the conditional UPDATE', () => {
  const idx = readFileSync(join(fnDir, 'index.ts'), 'utf8');
  const leaseSection = idx.slice(idx.indexOf('async tryClaimLease'));
  assert.ok(leaseSection.includes('ignoreDuplicates'), 'first claim must seed row (ON CONFLICT DO NOTHING)');
  assert.ok(leaseSection.includes("onConflict: 'source_id'"), 'seed keyed on source_id');
  assert.ok(leaseSection.includes('.or(`refresh_lease_until.is.null,refresh_lease_until.lt.'), 'conditional lease UPDATE');
});