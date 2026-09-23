#!/usr/bin/env node
/**
 * Aggregate test runner for `npm test`.
 *
 * WHY THIS EXISTS
 * ---------------
 * The audit found 42 test files but only five wired to npm scripts, no aggregate
 * `test` script, and no CI. Every suite not explicitly named in package.json
 * therefore never ran, which is how several stale assertions survived in the tree.
 * This runner discovers every test file so a suite cannot silently stop running.
 *
 * `--test-isolation=none` matters
 * -------------------------------
 * Node's test runner executes each file in a spawned child process by default.
 * That fails outright wherever process spawning is restricted (`spawn EPERM`),
 * which makes the suite unrunnable in a sandboxed CI step. With isolation disabled
 * the files run in one process, which is safe here because every suite is written
 * to be side-effect free: no network, no database, and stubs installed through
 * dynamic import rather than process-wide mutation before other suites load.
 *
 * `--experimental-strip-types` lets suites import the real `.ts` sources, which is
 * what makes "test the actual implementation" possible without a build step. It is
 * a no-op on Node versions where type stripping is enabled by default.
 *
 * Usage:
 *   node scripts/run-tests.mjs                 # everything
 *   node scripts/run-tests.mjs --filter chat   # only paths containing "chat"
 */

import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

/**
 * Files intentionally not run by `npm test`, each with the concrete reason, so a
 * skip is a documented decision rather than an accident.
 */
const SKIPPED = new Map([
  [
    'tests/database/chat-quota.mjs',
    'Needs an external PGlite database path as argv[2]; it is not a node:test suite and requires a Postgres-compatible engine that is not a project dependency.',
  ],
  [
    'tests/database/ai-caps.mjs',
    'Same external PGlite requirement as chat-quota.mjs: it executes the per-device/IP and monthly-cap migration on a real engine. The static guarantees it covers are asserted by tests/ai-limits.test.mjs, which does run here.',
  ],
  [
    'tests/database/content-seeds.mjs',
    'Same external PGlite requirement: it applies the generated content seeds (verses, prayers with audio, calendar) to a real engine and compares the row counts with the seed headers. The static guarantees are asserted by tests/bible-corpus-export.test.mjs.',
  ],
]);

const IGNORED_DIRS = new Set(['node_modules', '.git', '.expo', 'dist', 'work', 'android', 'ios']);

function collectTestFiles(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectTestFiles(full, out);
      continue;
    }
    if (/\.test\.(mjs|js|cjs|ts)$/.test(entry)) out.push(full);
  }
  return out;
}

function main() {
  const filterIndex = process.argv.indexOf('--filter');
  const filter = filterIndex >= 0 ? process.argv[filterIndex + 1] : null;

  const candidates = [
    ...collectTestFiles(join(ROOT, 'tests')),
    ...collectTestFiles(join(ROOT, 'supabase', 'functions')),
  ].sort();

  const files = [];
  const skipped = [];
  for (const abs of candidates) {
    const rel = relative(ROOT, abs).replace(/\\/g, '/');
    if (SKIPPED.has(rel)) {
      skipped.push({ rel, reason: SKIPPED.get(rel) });
      continue;
    }
    if (filter && !rel.includes(filter)) continue;
    files.push({ rel, abs });
  }

  if (files.length === 0) {
    console.error('No test files discovered — refusing to report success.');
    process.exitCode = 1;
    return;
  }

  console.log(`Ortodoxia test suite — ${files.length} file(s), ${skipped.length} skipped by policy`);
  for (const entry of skipped) console.log(`  skip: ${entry.rel} — ${entry.reason}`);
  console.log('');

  const args = [
    '--experimental-strip-types',
    '--test-isolation=none',
    '--test',
    ...files.map((entry) => entry.abs),
  ];

  const result = spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit' });

  if (result.error) {
    console.error(`Failed to launch the test runner: ${result.error.message}`);
    process.exitCode = 1;
    return;
  }

  process.exitCode = result.status ?? 1;
}

main();
