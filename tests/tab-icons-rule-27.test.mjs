/**
 * C25 (audit de pre-lansare) — iconițele din bara de tab-uri erau glyfe text la
 * `fontSize: 20`, sub pragul minim de 24 al regulii 27 din AGENTS.md. Poziția cere
 * „iconițe reale sau mărite"; aici sunt mărite și ținute la o singură valoare, ca să nu
 * poată aluneca înapoi sub prag fără ca vreun test să observe.
 *
 * Auditorul e o funcție separată de teste, ca să poată fi hrănit și cu forma de dinainte:
 * un auditor care nu poate pica nu apără nimic.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const TAB_LAYOUT = 'src/app/(tabs)/_layout.tsx';
const MIN_ICON = 24; // regula 27: „minim 24, fiecare în cerc alb"

const read = (relPath) => readFileSync(join(REPO, relPath), 'utf8');

/** Întoarce problemele găsite într-o sursă de bară de tab-uri (goală = poziția e verde). */
function auditTabIcons(source) {
  const problems = [];
  const lines = source.split('\n');

  const declared = /const TAB_ICON_SIZE = (\d+)/.exec(source);
  if (!declared) {
    problems.push('nu declară `TAB_ICON_SIZE`: pragul nu poate fi verificat');
  } else if (Number(declared[1]) < MIN_ICON) {
    problems.push(`TAB_ICON_SIZE = ${declared[1]} este sub minimul ${MIN_ICON} (regula 27)`);
  }

  // Orice dimensiune scrisă lângă o glyfă de iconiță trebuie să respecte pragul.
  lines.forEach((line, index) => {
    const isIconLine = /fontSize/.test(line) && /symbol|TabIcon/.test(line);
    if (!isIconLine) return;
    const literal = /fontSize:\s*(\d+)/.exec(line);
    if (literal && Number(literal[1]) < MIN_ICON) {
      problems.push(`linia ${index + 1}: glyfa are fontSize ${literal[1]}, sub ${MIN_ICON}`);
    }
    if (!literal && !/TAB_ICON_SIZE/.test(line)) {
      problems.push(`linia ${index + 1}: dimensiunea glyfei nu vine din constanta verificată`);
    }
  });

  const tabsWithIcon = (source.match(/tabBarIcon:/g) || []).length;
  if (tabsWithIcon < 5) {
    problems.push(`doar ${tabsWithIcon} tab-uri au iconiță; regula 29 cere 5-6 tab-uri, fiecare cu iconiță`);
  }
  return problems;
}

test('C25: iconițele din bara de tab-uri respectă pragul regulii 27', () => {
  const source = read(TAB_LAYOUT);
  assert.deepEqual(auditTabIcons(source), [], 'ICONIȚELE DE TAB SUNT DIN NOU SUB PRAG');
});

test('C25: fiecare tab are iconiță legată de culoarea temei, nu doar etichetă', () => {
  const source = read(TAB_LAYOUT);
  const screens = source.split('\n').filter((line) => line.includes('<Tabs.Screen'));
  assert.ok(screens.length >= 5, `aștept cel puțin 5 tab-uri, am găsit ${screens.length}`);
  for (const line of screens) {
    assert.match(line, /tabBarIcon:/, `tab fără iconiță: ${line.trim().slice(0, 80)}`);
    assert.match(line, /color=\{color\}/, `iconița nu primește culoarea temei: ${line.trim().slice(0, 80)}`);
  }
});

test('C25: auditorul prinde forma de dinainte (glyfă la 20)', () => {
  const current = read(TAB_LAYOUT);
  assert.deepEqual(auditTabIcons(current), []);

  const before = current.replace('const TAB_ICON_SIZE = 24', 'const TAB_ICON_SIZE = 20');
  assert.notEqual(before, current, 'mutația nu s-a aplicat — testul nu ar putea pica');
  const problems = auditTabIcons(before);
  assert.ok(problems.length > 0, 'auditorul trebuie să respingă pragul de 20');
  assert.ok(
    problems.some((p) => p.includes('sub minimul 24')),
    `auditorul trebuie să spună care e pragul încălcat, a spus: ${problems.join('; ')}`,
  );

  // A doua mutantă: glyfa scrisă direct, cu literă, fără constantă.
  const literal = current.replace('fontSize: TAB_ICON_SIZE', 'fontSize: 18');
  assert.notEqual(literal, current);
  assert.ok(auditTabIcons(literal).length > 0, 'o dimensiune literală sub prag trebuie respinsă');

  // A treia: poziția „reparată" prin ștergerea iconițelor.
  const stripped = current.replace(/,\s*tabBarIcon: \(\{ color \}\) => <TabIcon[^/]*\/>/g, '');
  assert.notEqual(stripped, current, 'mutația nu s-a aplicat — testul nu ar putea pica');
  assert.ok(auditTabIcons(stripped).length > 0, 'ștergerea iconițelor nu e o reparație');
});
