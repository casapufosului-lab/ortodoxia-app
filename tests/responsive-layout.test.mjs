/**
 * Obiectivul 1b (09.10.2026): layoutul nu are voie să presupună un singur tip de ecran.
 *
 * Bug-ul din 09.10.2026 a arătat că, dacă dimensiunile se scriu fix în px pentru ecranul pe
 * care s-a probat, se strică pe altul (bara de tab-uri acoperită de bara de navigare pe 3
 * butoane). Aici se testează cele două reguli care ies din `@/lib/responsive-layout`:
 * padding-ul de jos include zona sigură, iar pe ecran lat (foldable/tabletă) conținutul se
 * centrează și se limitează. Funcțiile pure se testează DIRECT, nu doar prin citirea sursei.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CONTENT_MAX_WIDTH,
  SCREEN_BOTTOM_BASE_PADDING,
  WIDE_SCREEN_MIN_WIDTH,
  contentBoxStyle,
  isWideScreen,
  screenBottomPadding,
} from '../src/lib/responsive-layout.ts';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTAINER = 'src/components/mvp-ui.tsx';
const LEGAL_SCREENS = ['src/app/privacy.tsx', 'src/app/terms.tsx'];

const read = (relPath) => readFileSync(join(REPO, relPath), 'utf8');

/**
 * Comentariile nu sunt cod: fără curățarea lor, un comentariu care povestește bugul
 * (`paddingBottom: 36`) ar face auditorul să dea alarme false, iar un hook doar pomenit
 * într-un comentariu ar trece drept folosit.
 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** Auditor pe sursa containerului comun (goală = poziția e verde). */
function auditResponsiveContainer(source) {
  const code = stripComments(source);
  const problems = [];

  if (!/useSafeAreaInsets\s*\(\s*\)/.test(code)) {
    problems.push('nu citește zona sigură (`useSafeAreaInsets()`)');
  }
  if (!/\binsets\.bottom\b/.test(code)) {
    problems.push('nu folosește `insets.bottom`');
  }
  if (!/useWindowDimensions\s*\(\s*\)/.test(code)) {
    problems.push('nu citește lățimea ecranului (`useWindowDimensions()`)');
  }
  if (!/contentBoxStyle\s*\(/.test(code)) {
    problems.push('nu aplică regula de ecran lat (`contentBoxStyle`)');
  }
  if (!/screenBottomPadding\s*\(/.test(code)) {
    problems.push('nu aplică padding-ul de jos cu zonă sigură (`screenBottomPadding`)');
  }
  // Doar padding-urile „de container" (≥ 20) contează; 4px sub un titlu e tipografie.
  if (/(?<![.\w])paddingBottom:\s*(?:[2-9]\d|\d{3,})\b/.test(code)) {
    problems.push('are din nou un padding de jos fix, care ignoră zona sigură');
  }

  return problems;
}

test('1b: ecran lat doar de la pragul documentat, citirile ciudate nu centrează nimic', () => {
  assert.equal(WIDE_SCREEN_MIN_WIDTH, 600);

  for (const width of [320, 360, 411, 599]) {
    assert.equal(isWideScreen(width), false, `${width}dp e ecran de telefon, nu lat`);
    assert.deepEqual(contentBoxStyle(width), {}, `${width}dp nu are voie să fie limitat/centrat`);
  }

  for (const width of [600, 673, 800, 1104]) {
    assert.equal(isWideScreen(width), true, `${width}dp e ecran lat (foldable/tabletă)`);
    assert.deepEqual(contentBoxStyle(width), {
      width: '100%',
      maxWidth: CONTENT_MAX_WIDTH,
      alignSelf: 'center',
    });
  }

  // O citire lipsă sau nefinită NU are voie să mute layoutul pe telefon.
  for (const bogus of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, undefined, null]) {
    assert.equal(isWideScreen(bogus), false, `lățime invalidă (${String(bogus)}) nu e ecran lat`);
    assert.deepEqual(contentBoxStyle(bogus), {});
  }
});

test('1b: padding-ul de jos al conținutului include zona sigură', () => {
  assert.equal(screenBottomPadding(0), SCREEN_BOTTOM_BASE_PADDING);

  // Pe navigarea pe 3 butoane sistemul raportează 48dp (126px la 420dpi): exact atât în plus.
  assert.equal(screenBottomPadding(48), SCREEN_BOTTOM_BASE_PADDING + 48);
  for (const inset of [16, 24, 34, 48, 63]) {
    assert.equal(screenBottomPadding(inset), SCREEN_BOTTOM_BASE_PADDING + inset);
  }

  // Ecranele juridice își păstrează baza lor, dar tot adaugă zona sigură.
  assert.equal(screenBottomPadding(0, 60), 60);
  assert.equal(screenBottomPadding(48, 60), 108);

  // Baza nu are voie să scadă din cauza unei citiri ciudate.
  for (const bogus of [-10, Number.NaN, Number.POSITIVE_INFINITY, undefined, null]) {
    assert.equal(
      screenBottomPadding(bogus),
      SCREEN_BOTTOM_BASE_PADDING,
      `o citire invalidă a zonei sigure (${String(bogus)}) nu are voie să micșoreze padding-ul`,
    );
  }
});

test('1b: containerul comun aplică ambele reguli', () => {
  assert.deepEqual(
    auditResponsiveContainer(read(CONTAINER)),
    [],
    'CONTAINERUL COMUN A PIERDUT ZONA SIGURĂ SAU REGULA DE ECRAN LAT (vezi bug-ul din 09.10.2026)',
  );
});

test('1b: ecranele juridice adaugă zona sigură peste baza lor', () => {
  for (const screen of LEGAL_SCREENS) {
    const source = stripComments(read(screen));
    assert.match(source, /useSafeAreaInsets\s*\(\s*\)/, `${screen} nu citește zona sigură`);
    assert.match(source, /screenBottomPadding\s*\(/, `${screen} nu adaugă zona sigură la padding-ul de jos`);
    assert.doesNotMatch(
      source,
      /(?<![.\w])paddingBottom:\s*(?:[2-9]\d|\d{3,})\b/,
      `${screen} are din nou padding de jos fix, fără zona sigură`,
    );
  }
});

test('1b: auditorul prinde forme dinainte (padding fix, fără zonă sigură)', () => {
  const current = read(CONTAINER);
  assert.deepEqual(auditResponsiveContainer(current), []);

  // Mutanța 1: containerul de dinainte — padding de jos fix, fără citirea zonei sigure.
  const reverted = current
    .replace(
      /contentContainerStyle=\{\[[\s\S]*?\]\}/,
      'contentContainerStyle={[styles.screen, contentStyle]}',
    )
    .replace("screen: { width: '100%', padding: 20, gap: 18 }", "screen: { width: '100%', padding: 20, paddingBottom: 36, gap: 18 }");
  assert.notEqual(reverted, current, 'mutația nu s-a aplicat — testul nu ar putea pica');
  const revertedProblems = auditResponsiveContainer(reverted);
  assert.ok(revertedProblems.length > 0, 'auditorul trebuie să respingă padding-ul de jos fix');
  assert.ok(
    revertedProblems.some((problem) => problem.includes('padding de jos fix')),
    `auditorul trebuie să spună ce anume e greșit, a spus: ${revertedProblems.join('; ')}`,
  );

  // Mutanța 2: zona sigură nu mai e citită deloc (insetul devine 0 fix).
  const noInsets = current
    .replace(
      "import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';",
      "import { SafeAreaView } from 'react-native-safe-area-context';",
    )
    .replace('const insets = useSafeAreaInsets();', 'const insets = { bottom: 0 };');
  assert.notEqual(noInsets, current, 'mutația nu s-a aplicat — testul nu ar putea pica');
  assert.ok(
    auditResponsiveContainer(noInsets).length > 0,
    'un container care nu mai citește zona sigură nu are voie să treacă',
  );

  // Mutanța 3: regula de ecran lat scoasă (telefonul merge, tableta se întinde).
  const noWideRule = current.replace('contentBoxStyle(width),', '');
  assert.notEqual(noWideRule, current, 'mutația nu s-a aplicat — testul nu ar putea pica');
  assert.ok(
    auditResponsiveContainer(noWideRule).some((problem) => problem.includes('ecran lat')),
    'scoaterea regulii de ecran lat trebuie raportată',
  );
});
