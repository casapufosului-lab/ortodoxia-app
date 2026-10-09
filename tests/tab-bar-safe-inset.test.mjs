/**
 * B29 (bug de afișare, 09.10.2026) — bara de tab-uri dispărea pe telefoanele cu navigare
 * pe 3 butoane.
 *
 * Cauza: `src/app/(tabs)/_layout.tsx` scria `height: 66` și `paddingBottom: 8` FIXE, fără
 * nicio citire a zonei sigure. Cu `targetSdk 36`, Android 15 desenează edge-to-edge, deci
 * conținutul intră sub bara de navigare a sistemului; pe emulatorul de dezvoltare (navigare
 * gestuală) bara de sistem e subțire, de aceea bug-ul nu s-a văzut.
 *
 * Auditorul e o funcție separată de teste, ca să poată fi hrănit și cu formele greșite: un
 * auditor care nu poate pica nu apără nimic. Dimensiunile se testează DIRECT, pe funcția
 * pură `tabBarMetrics`, nu doar prin citirea sursei.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  TAB_BAR_BASE_HEIGHT,
  TAB_BAR_BASE_PADDING_BOTTOM,
  tabBarMetrics,
} from '../src/lib/tab-bar-metrics.ts';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const TAB_LAYOUT = 'src/app/(tabs)/_layout.tsx';

const read = (relPath) => readFileSync(join(REPO, relPath), 'utf8');

/** Întoarce problemele găsite într-o sursă de bară de tab-uri (goală = poziția e verde). */
function auditTabBarSafeInset(source) {
  const problems = [];

  const importsHook =
    /import\s*\{[^}]*\buseSafeAreaInsets\b[^}]*\}\s*from\s*'react-native-safe-area-context'/.test(source);
  if (!importsHook) {
    problems.push('nu importă `useSafeAreaInsets` din `react-native-safe-area-context`');
  }
  if (!/useSafeAreaInsets\(\s*\)/.test(source)) {
    problems.push('nu apelează `useSafeAreaInsets()`');
  }
  if (!/insets\.bottom/.test(source)) {
    problems.push('nu citește `insets.bottom` nicăieri: bara nu poate ști de zona sigură');
  }

  const styleBlock = /tabBarStyle:\s*\{([\s\S]*?)\}/.exec(source);
  if (!styleBlock) {
    problems.push('nu are `tabBarStyle` — nu se poate verifica bara');
    return problems;
  }
  const style = styleBlock[1];

  // Dimensiunile trebuie să vină din insetul de jos: fie direct, fie prin metricele derivate.
  const derived = /const\s+(\w+)\s*=\s*tabBarMetrics\(\s*insets\.bottom\s*\)/.exec(source);
  const derivedName = derived ? derived[1] : null;
  const spread = derivedName ? new RegExp(`\\.\\.\\.\\s*${derivedName}\\b`).test(style) : false;
  const inlineInset = /insets\.bottom/.test(style);
  if (!spread && !inlineInset) {
    problems.push('`tabBarStyle` nu include insetul de jos (nici spread de metrice, nici insets.bottom)');
  }

  // Și, în același timp, dimensiunile NU au voie să fie iar literale fixe.
  if (/(?<![.\w])height:\s*\d/.test(style)) {
    problems.push('`tabBarStyle` are din nou o înălțime fixă, care ignoră zona sigură');
  }
  if (/(?<![.\w])paddingBottom:\s*\d/.test(style)) {
    problems.push('`tabBarStyle` are din nou un padding de jos fix, care ignoră zona sigură');
  }

  return problems;
}

test('B29: bara de tab-uri folosește insetul de jos al zonei sigure', () => {
  const source = read(TAB_LAYOUT);
  assert.deepEqual(
    auditTabBarSafeInset(source),
    [],
    'BARA DE TAB-URI A PIERDUT ZONA SIGURĂ DE JOS (vezi bug-ul din 09.10.2026)',
  );
});

test('B29: `tabBarMetrics` adună zona sigură peste dimensiunea de bază', () => {
  // Fără zonă sigură (navigare pe 3 butoane nedetectată / emulator): dimensiunea istorică.
  assert.deepEqual(tabBarMetrics(0), {
    height: TAB_BAR_BASE_HEIGHT,
    paddingBottom: TAB_BAR_BASE_PADDING_BOTTOM,
  });

  // Cu zonă sigură: exact atât cât raportează sistemul, în plus.
  for (const inset of [24, 32, 38, 48, 96]) {
    assert.deepEqual(
      tabBarMetrics(inset),
      { height: 66 + inset, paddingBottom: 8 + inset },
      `bara nu crește cu zona sigură pentru insets.bottom = ${inset}`,
    );
  }

  // Bara nu are voie să SCADĂ din cauza unei citiri ciudate.
  for (const bogus of [-10, Number.NaN, Number.POSITIVE_INFINITY, undefined, null]) {
    const metrics = tabBarMetrics(bogus);
    assert.ok(
      metrics.height >= TAB_BAR_BASE_HEIGHT && metrics.paddingBottom >= TAB_BAR_BASE_PADDING_BOTTOM,
      `o citire invalidă a zonei sigure (${String(bogus)}) nu are voie să micșoreze bara: ${JSON.stringify(metrics)}`,
    );
    assert.ok(Number.isFinite(metrics.height) && Number.isFinite(metrics.paddingBottom));
  }
});

test('B29: auditorul prinde forma dinainte (înălțime fixă, fără zonă sigură)', () => {
  const current = read(TAB_LAYOUT);
  assert.deepEqual(auditTabBarSafeInset(current), []);

  // Mutanța 1: exact linia de dinaintea bug-ului — dimensiuni fixe, fără inset.
  const reverted = current.replace(
    'tabBarStyle: { backgroundColor: palette.card, borderTopColor: palette.divider, ...barMetrics, paddingTop: 6 }',
    'tabBarStyle: { backgroundColor: palette.card, borderTopColor: palette.divider, height: 66, paddingBottom: 8, paddingTop: 6 }',
  );
  assert.notEqual(reverted, current, 'mutația nu s-a aplicat — testul nu ar putea pica');
  const revertedProblems = auditTabBarSafeInset(reverted);
  assert.ok(revertedProblems.length > 0, 'auditorul trebuie să respingă înălțimea fixă');
  assert.ok(
    revertedProblems.some((p) => p.includes('înălțime fixă')),
    `auditorul trebuie să spună ce anume e greșit, a spus: ${revertedProblems.join('; ')}`,
  );

  // Mutanța 2: hook-ul chemat, dar rezultatul ignorat (insetul nu ajunge în stil).
  const ignored = current.replace('...barMetrics,', '');
  assert.notEqual(ignored, current, 'mutația nu s-a aplicat — testul nu ar putea pica');
  assert.ok(auditTabBarSafeInset(ignored).length > 0, 'ștergerea spread-ului de metrice nu e o reparație');

  // Mutanța 3: zona sigură citită, dar niciodată folosită.
  const unused = current
    .replace("import { useSafeAreaInsets } from 'react-native-safe-area-context';", '')
    .replace('const insets = useSafeAreaInsets();', 'const insets = { bottom: 0 };');
  assert.notEqual(unused, current, 'mutația nu s-a aplicat — testul nu ar putea pica');
  assert.ok(auditTabBarSafeInset(unused).length > 0, 'insetul nefolosit nu apără bara');
});
