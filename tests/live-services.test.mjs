import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const registrySource = readFileSync(join(root, 'src/live/live-services.ts'), 'utf8');
const typesSource = readFileSync(join(root, 'src/live/types.ts'), 'utf8');
const accessSource = readFileSync(join(root, 'src/live/live-service-access.ts'), 'utf8');

function extractAllowlist(src) {
  const match = src.match(/ALLOWED_DOMAINS\s*=\s*\[([\s\S]*?)\]\s*as const/);
  assert.ok(match, 'ALLOWED_DOMAINS array not found');
  const entries = [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  return new Set(entries.map((d) => d.toLowerCase()));
}

function extractSourceObjects(src) {
  const objects = [];
  const idRe = /\n\s*\{\s*\n\s*id:\s*'([^']+)'/g;
  let m;
  while ((m = idRe.exec(src)) !== null) {
    const start = m.index;
    const endSearch = src.indexOf('\n  },', start);
    const end = endSearch === -1 ? src.indexOf('\n  }', start) : endSearch;
    if (end === -1) continue;
    objects.push({ id: m[1], block: src.slice(start, end + 4) });
  }
  return objects;
}

function getBlockField(block, field) {
  const lines = block.split('\n');
  for (const line of lines) {
    const m = line.match(new RegExp(`${field}:\\s*['"\\[]?([^'"\\]],*)['"]?`));
    if (m) return m[1].trim().replace(/,/g, '').replace(/'/g, '');
  }
  return undefined;
}

const sourceEntries = extractSourceObjects(registrySource);
const sources = sourceEntries.map((e) => ({
  id: e.id,
  channelId: getBlockField(e.block, 'officialChannelId'),
  enabled: e.block.includes('enabled: true'),
}));

const allowlist = extractAllowlist(registrySource);


// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('source IDs are unique', () => {
  const ids = sourceEntries.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate ids found');
});

test('expected number of candidate sources in registry', () => {
  assert.equal(sources.length, 14, 'expected 14 candidate sources');
});

test('enabled sources have all required fields', () => {
  for (const entry of sourceEntries.filter((e) => e.block.includes('enabled: true'))) {
    for (const field of ['id', 'name', 'location', 'provider', 'officialWebsiteUrl', 'officialChannelUrl', 'streamType']) {
      assert.ok(getBlockField(entry.block, field), `${entry.id} missing ${field}`);
    }
  }
});

test('all permanent source URLs are HTTPS', () => {
  const urlMatches = registrySource.match(/official(?:Website|Channel)Url:\s*'([^']+)'/g) || [];
  for (const match of urlMatches) {
    const url = match.match(/'([^']+)'/)[1];
    assert.ok(url.startsWith('https://'), `non-HTTPS URL: ${url}`);
  }
});

test('all permanent source domains are on the allowlist', () => {
  const urlMatches = registrySource.match(/official(?:Website|Channel)Url:\s*'([^']+)'/g) || [];
  for (const match of urlMatches) {
    const url = match.match(/'([^']+)'/)[1];
    const host = new URL(url).hostname.toLowerCase();
    assert.ok(allowlist.has(host), `domain not allowlisted for ${url}`);
  }
});

test('disabled sources exist and are filtered from enabled view', () => {
  const disabled = sources.filter((s) => !s.enabled);
  assert.ok(disabled.length >= 1, 'expected at least one disabled source');
  assert.ok(registrySource.includes('source.enabled && source.countryCode === countryCode'));
  assert.ok(registrySource.includes('.sort((a, b) => a.priority - b.priority)'));
});

test('permanent source contains no current videoId field', () => {
  // Ensure no live-services source objects contain a videoId field assignment.
  // The word "videoId" may appear in comments but never as a field value.
  const fieldMatches = registrySource.match(/videoId\s*:/g);
  assert.ok(!fieldMatches, 'registry source objects must not have a videoId field');
});

test('no permanent URL uses youtube.com/watch?v=', () => {
  assert.ok(!registrySource.includes('watch?v='), 'no watch?v= in permanent registry');
});

test('ALLOWED_DOMAINS only contain plain hostnames', () => {
  for (const host of allowlist) {
    assert.ok(!host.includes('://'), `allowlist entry must be plain hostname: ${host}`);
    assert.ok(!host.includes('/'), `allowlist entry must not contain path: ${host}`);
  }
});

test('safe URL validation checks HTTPS and domain allowlist', () => {
  assert.ok(accessSource.includes("parsed.protocol !== 'https:'"));
  assert.ok(accessSource.includes('isAllowedDomain(parsed.hostname)'));
  assert.ok(accessSource.includes('LIVE_OPEN_ERROR_CODE'));
});

test('live screen renders LIVE ACUM only when backend confirms LIVE (not hardcoded)', () => {
  const liveScreen = readFileSync(join(root, 'src/app/live.tsx'), 'utf8');
  // LIVE ACUM is now i18n-ized: the literal string is no longer in live.tsx.
  // The i18n key t('live.statusLive') is used instead.
  assert.ok(liveScreen.includes("t('live.statusLive')"), 'live screen must use i18n key for LIVE ACUM');
  // Verify it is inside a function (conditional rendering), not hardcoded as static JSX text.
  assert.ok(liveScreen.includes("case 'live'"), 'LIVE ACUM must be conditional on backend status');
  assert.ok(!liveScreen.includes('Nu este live acum'), 'must not claim not-live with wrong wording');
  assert.ok(typesSource.includes("'live' | 'not_live' | 'unknown'"));
});

test('Home screen has Slujbe LIVE navigation card', () => {
  const home = readFileSync(join(root, 'src/app/(tabs)/index.tsx'), 'utf8');
  assert.ok(home.includes("router.push('/live')"), 'must route to /live');
  assert.ok(home.includes("t('home.liveSectionTitle')"), 'must show localized Slujbe LIVE title');
  assert.ok(home.includes("t('home.liveSubtitle')"), 'must show localized live subtitle');
});

test('live screen exists and is registered in navigation', () => {
  assert.ok(existsSync(join(root, 'src/app/live.tsx')), 'src/app/live.tsx must exist');
  const rootLayout = readFileSync(join(root, 'src/app/_layout.tsx'), 'utf8');
  assert.ok(rootLayout.includes('name="live"'), 'live screen registered in Stack');
});

test('registry exports ALLOWED_DOMAINS and helpers', () => {
  assert.ok(registrySource.includes('export const ALLOWED_DOMAINS'));
  assert.ok(registrySource.includes('export function isAllowedDomain'));
  assert.ok(registrySource.includes('export function getEnabledLiveSources'));
});
