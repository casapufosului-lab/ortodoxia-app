#!/usr/bin/env node
/**
 * Safety gate for the Ortodoxia app.
 *
 * WHY THIS EXISTS
 * ---------------
 * Two details have been found (in this same working session) that a static review said
 * were fine and that a real run proved were not:
 *
 *   1. The startup budget script parsed the Metro bundle wrong for two iterations and
 *      reported "5 modules evaluated at launch" while the true answer was hundreds.
 *      Its parser is the whole reason it is trusted, so it is unit-tested — including
 *      the two failure modes that were actually hit.
 *
 *   2. The accessibility audit reported 82 findings on the first run, of which ~50 were
 *      artifacts of its own text scanner (TypeScript generics read as JSX copy). A
 *      checker that cries wolf gets ignored, so its parser is tested on the same class
 *      of input that fooled it.
 *
 * Both parsers are pure functions over text, so they can be exercised directly, with no
 * runtime, no bundler and no network. This script is that exercise, wired to `npm run
 * safety` so a change to either parser cannot quietly make a gate meaningless.
 *
 *   3. The AI assistant's own safety rules live in one template string inside the Edge
 *      Function. A shorter rewrite of that prompt (or a deleted line) changes what the
 *      assistant does, and nothing else would notice. That suite checks the rules are
 *      present, that the prompt is really the one sent to OpenAI, that the reporting path
 *      exists end to end — and that the check itself fails when a rule is removed.
 *
 * It does not replace the real gates (`test:a11y`, `test:startup`); it checks that the
 * gates can still see.
 *
 * Usage:
 *   npm run safety
 */

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

/**
 * Parser suites live in their own scripts and are run through their `--self-test` mode,
 * so the tests sit next to the code they cover rather than in a parallel copy.
 */
const SUITES = [
  {
    name: 'startup bundle parser',
    script: join(ROOT, 'scripts', 'startup-budget.mjs'),
    why: 'decides whether the Play Billing SDK and the Moldova seeds are loaded at launch',
  },
  {
    name: 'accessibility scanner',
    script: join(ROOT, 'scripts', 'accessibility-audit.mjs'),
    why: 'decides whether every control, label, tap target and colour pair is usable',
  },
  {
    name: 'chat safety rules',
    script: join(ROOT, 'scripts', 'chat-safety-rules.mjs'),
    why: 'decides whether the AI still refuses medical advice and routes self-harm to 112, and whether a reported answer can reach a human',
  },
];

let failures = 0;
let checks = 0;

for (const suite of SUITES) {
  console.log(`\n── ${suite.name} — ${suite.why}`);
  const result = spawnSync(process.execPath, [suite.script, '--self-test'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trimEnd();
  for (const line of output.split('\n')) console.log(`  ${line}`);
  const suiteChecks = (output.match(/^(PASS|FAIL)\b/gm) ?? []).length;
  checks += suiteChecks;
  if (result.status !== 0) {
    failures += 1;
  }
  if (suiteChecks === 0) {
    console.log('  FAIL  the suite printed no PASS/FAIL lines — it did not actually run');
    failures += 1;
  }
}

console.log('');
console.log(`Ortodoxia safety gate — ${checks} parser check(s)`);
if (failures > 0) {
  console.log(`SAFETY GATE: FAILED (${failures} suite(s)).`);
  process.exitCode = 1;
} else {
  console.log('SAFETY GATE: OK — all ${SUITES.length} gate suites still read their input correctly.');
}
