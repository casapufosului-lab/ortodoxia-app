import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { test } from 'node:test';

/**
 * Regression guard for the audit's string scanner (scripts/accessibility-audit.mjs).
 *
 * WHY THIS EXISTS
 * ---------------
 * The scanner used to enter its `mode = 'string'` state even though it had already
 * consumed the literal inline, so the top-of-loop branch then swallowed the NEXT
 * literal's opening quote. Every later literal was shifted by one and the reported
 * copy depended on the file's layout rather than on its content: adding a two-quote
 * declaration such as `const LEGAL_DOCUMENTS_VERSION = '2026-10-08';` above
 * `throw new Error('OAuth URL missing.')` in src/app/auth.tsx turned a developer-facing
 * error into a reported "hardcoded UI copy" finding, while a genuinely hardcoded JSX
 * string could slip through unnoticed.
 *
 * The suites below run the REAL script on throwaway fixtures in the OS temp directory,
 * so they pin the pairing without touching the repository or the shipped sources.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

/** One throwaway copy of the audit script, plus the palette it reads. */
function makeTree() {
  const root = mkdtempSync(join(tmpdir(), 'ortodoxia-a11y-'));
  mkdirSync(join(root, 'scripts'), { recursive: true });
  mkdirSync(join(root, 'src', 'constants'), { recursive: true });
  copyFileSync(join(REPO, 'scripts', 'accessibility-audit.mjs'), join(root, 'scripts', 'accessibility-audit.mjs'));
  copyFileSync(join(REPO, 'src', 'constants', 'palette.ts'), join(root, 'src', 'constants', 'palette.ts'));
  return root;
}

function audit(root) {
  const result = spawnSync(process.execPath, [join(root, 'scripts', 'accessibility-audit.mjs')], {
    cwd: root,
    encoding: 'utf8',
  });
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

test('the string scanner pairs literals one to one, so layout cannot fake a finding', () => {
  const root = makeTree();
  try {
    // Developer-facing strings only: every one of them is code, not user-visible copy.
    writeFileSync(join(root, 'src', 'oauth-guard.tsx'), `import { Text } from 'react-native';

function friendly(error: unknown) {
  if (!(error instanceof Error)) return 'x';
  const msg = error.message.toLowerCase();
  if (msg.includes('invalid login') || msg.includes('email or password')) return 'invalid';
  if (msg.includes('already registered') || msg.includes('user already')) return 'taken';
  return 'generic';
}

const LEGAL_DOCUMENTS_VERSION = '2026-10-08';

function fail() {
  throw new Error('OAuth URL missing.');
}

export function Screen() {
  return <Text>{LEGAL_DOCUMENTS_VERSION}</Text>;
}
`, 'utf8');

    const { status, output } = audit(root);
    assert.doesNotMatch(output, /hardcoded UI copy/);
    assert.equal(status, 0, output);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the string scanner still reports copy a user would actually read', () => {
  const root = makeTree();
  try {
    writeFileSync(join(root, 'src', 'hardcoded-copy.tsx'), `import { Text } from 'react-native';

function friendly(error: unknown) {
  if (!(error instanceof Error)) return 'x';
  const msg = error.message.toLowerCase();
  if (msg.includes('invalid login')) return 'invalid';
  return 'generic';
}

const LEGAL_DOCUMENTS_VERSION = '2026-10-08';

export function Screen() {
  return <Text>Bun venit în aplicație, prietene</Text>;
}
`, 'utf8');

    const { status, output } = audit(root);
    assert.match(output, /hardcoded UI copy: "Bun venit în aplicație, prietene"/);
    assert.equal(status, 1, output);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the scanner never leaves a literal unterminated after a multi-quote file', () => {
  const script = readFileSync(join(REPO, 'scripts', 'accessibility-audit.mjs'), 'utf8');
  // The literal is consumed inline, so the loop must not re-enter string mode afterwards.
  assert.doesNotMatch(script, /mode = ch === '`' \? 'template' : 'string';/);
  assert.match(script, /The literal is consumed right here/);
});
