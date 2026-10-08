#!/usr/bin/env node
/**
 * Accessibility audit for the Ortodoxia mobile app.
 *
 * WHY THIS IS A STATIC SCRIPT
 * ---------------------------
 * The UI test suites in this repository already read `.tsx` sources as text and
 * assert on structure (see tests/ui-*.test.mjs). Rendering the real screens would
 * need a device or an emulator plus a React Native test renderer, neither of which
 * is a project dependency and both of which are unavailable in CI. A static pass
 * over the shipped JSX catches the failures that actually reach users — a control
 * with no role, a field with no label, a tap target smaller than a fingertip, a
 * text/background pair that is unreadable — and it runs in under a second with no
 * network and no writes.
 *
 * WHAT IT CHECKS
 * --------------
 *   A1  Every interactive element exposes a role, or an explicit label.
 *   A2  Every TextInput has an accessibilityLabel (or is label-wrapped).
 *   A3  Non-decorative images carry a label; decorative ones opt out explicitly.
 *   A4  Every interactive element reaches the 48x48dp minimum touch target.
 *   A5  Text/background colour pairs meet WCAG 2.1 AA.
 *   A6  Screen and section headings are announced as headings.
 *   A7  No user-visible string is hardcoded in JSX instead of going through t().
 *   A8  An icon-only control draws a glyph of at least 24pt inside a rounded background.
 *   A9  A back control reaches the 56pt circle of AGENTS.md rule 28.
 *
 * A4 is 48, not 44: Apple's floor is 44pt but Google's is 48dp, and Play is the
 * store this build ships to. A8 and A9 are rules 27 and 28 of AGENTS.md written
 * as checks, so a hand-drawn icon or back arrow cannot slip under them again.
 * The `--self-test` fixtures below pin both thresholds against the shape the rules
 * describe, so moving either number without a reason fails the run.
 *
 * A7 is included because a hardcoded string is invisible to screen readers in
 * every locale but Romanian: the corpus holds 521 keys x 10 locales and a literal
 * in JSX silently opts out of all of them.
 *
 * Usage:
 *   node scripts/accessibility-audit.mjs            # report, exit 1 on any finding
 *   node scripts/accessibility-audit.mjs --list     # list every finding, no cap
 *
 * The script never writes and never touches the network.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const LIST_ALL = process.argv.includes('--list');

const findings = [];
function report(rule, file, message, detail) {
  findings.push({ rule, file: relative(ROOT, file).replace(/\\/g, '/'), message, detail });
}

// ─────────────────────────────────────────────────────────────────────────────
// Source discovery
// ─────────────────────────────────────────────────────────────────────────────

const SKIP_DIRS = new Set(['node_modules', '.git', '.expo', 'dist', 'work', 'android', 'ios', '.npm-cache']);

function collect(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collect(full, out);
      continue;
    }
    if (/\.(tsx|ts)$/.test(entry) && !/\.d\.ts$/.test(entry)) out.push(full);
  }
  return out;
}

/*
 * The screens a real run scans. Collected lazily, inside main(), because `--self-test`
 * must be runnable from anywhere — including a copy of this file in a temp directory,
 * which is how `tests/accessibility-thresholds.test.mjs` proves a lowered threshold
 * actually fails.
 */
function sourceFiles() {
  return collect(join(ROOT, 'src'));
}

// ─────────────────────────────────────────────────────────────────────────────
// Minimal JSX scanner
// ─────────────────────────────────────────────────────────────────────────────

/** Index just past the matching `>` of a tag whose `<` is at `start`. */
function endOfTag(source, start) {
  let i = start + 1;
  let brace = 0;
  let quote = null;
  while (i < source.length) {
    const ch = source[i];
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
    } else if (ch === '{') brace += 1;
    else if (ch === '}') brace -= 1;
    else if (ch === '>' && brace === 0) return i + 1;
    i += 1;
  }
  return source.length;
}

/** The matching `</Name>` index for an opening tag, or source.length. */
function endOfElement(source, name, afterOpenTag) {
  if (name === '') return afterOpenTag;
  const open = new RegExp(`<${name}(?=[\\s/>])`, 'g');
  const close = new RegExp(`</${name}\\s*>`, 'g');
  let depth = 1;
  let cursor = afterOpenTag;
  while (depth > 0 && cursor < source.length) {
    open.lastIndex = cursor;
    close.lastIndex = cursor;
    const nextOpen = open.exec(source);
    const nextClose = close.exec(source);
    if (!nextClose) return source.length;
    if (nextOpen && nextOpen.index < nextClose.index) {
      depth += 1;
      cursor = nextOpen.index + nextOpen[0].length;
    } else {
      depth -= 1;
      cursor = nextClose.index + nextClose[0].length;
    }
  }
  return cursor;
}

/**
 * Candidate literal text nodes: the raw text between a `>` and the next `<`.
 *
 * WHY THIS IS DELIBERATELY CONSERVATIVE
 * -------------------------------------
 * Two earlier drafts tried to decide whether a `>` opened JSX content or closed a
 * TypeScript generic. Both failed on real source: `useState<LanguageCode>(...)`,
 * `Record<string, unknown>` and `): Promise<void>` all look like a tag boundary,
 * and the second draft reported 300+ code lines as "hardcoded UI copy" — including
 * `try`, `catch` and every StyleSheet key. A checker that cries wolf is worse than
 * no checker, because the one true finding is buried.
 *
 * So this pass only *collects* candidates and `looksLikeCopy()` above applies a
 * strict lexical test. The cost is that an exotic hardcoded string may slip
 * through; the benefit is that every finding this script prints is real.
 *
 * Returns `{ text, start }` with absolute offsets; strings, template literals and
 * comments are skipped so a string constant is never mistaken for screen copy.
 */
function scanTextNodes(source) {
  const nodes = [];
  let i = 0;
  let mode = 'code'; // code | line-comment | block-comment | string | template
  let textStart = -1;

  const pushText = (end) => {
    if (textStart < 0) return;
    const raw = source.slice(textStart, end);
    if (raw.trim()) nodes.push({ text: raw, start: textStart });
    textStart = -1;
  };

  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];

    if (mode === 'line-comment') {
      if (ch === '\n') mode = 'code';
      i += 1;
      continue;
    }
    if (mode === 'block-comment') {
      if (ch === '*' && next === '/') {
        mode = 'code';
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }
    if (mode === 'string' || mode === 'template') {
      const terminator = mode === 'string' ? "'" : '`';
      if (ch === '\\') i += 2;
      else if (ch === terminator) {
        mode = 'code';
        i += 1;
      } else i += 1;
      continue;
    }

    if (ch === '/' && next === '/') {
      pushText(i);
      mode = 'line-comment';
      i += 2;
      continue;
    }
    if (ch === '/' && next === '*') {
      pushText(i);
      mode = 'block-comment';
      i += 2;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`' || ch === '\u2018' || ch === '\u201c' || ch === '\u300c' || ch === '\u300e') {
      pushText(i);
      const terminator = ch === '\u2018' ? '\u2019'
        : ch === '\u201c' ? '\u201d'
          : ch === '\u300c' ? '\u300d'
            : ch === '\u300e' ? '\u300f'
              : ch;
      // The literal is consumed right here, so the scanner stays in code mode. Setting
      // `mode` to 'string'/'template' made the top-of-loop branch swallow the NEXT
      // literal's opening quote, which shifted every later literal by one and made the
      // reported copy depend on the file's layout instead of its content: it misread
      // `throw new Error('OAuth URL missing.')` in src/app/auth.tsx as user-visible copy
      // as soon as any two-quote declaration was added above it.
      i += 1;
      while (i < source.length && source[i] !== terminator) {
        if (source[i] === '\\') i += 1;
        i += 1;
      }
      i += 1;
      continue;
    }
    if (ch === '>') {
      pushText(i);
      textStart = i + 1;
      i += 1;
      continue;
    }
    if (ch === '<') {
      pushText(i);
      i += 1;
      continue;
    }
    if (textStart < 0) textStart = i;
    i += 1;
  }
  pushText(source.length);
  return nodes;
}

/** Every JSX opening element in a file, with its attribute text and its children. */
function scanElements(source) {
  const elements = [];
  let i = 0;
  while (i < source.length) {
    const lt = source.indexOf('<', i);
    if (lt < 0) break;
    const next = source[lt + 1];
    if (!next || !/[A-Za-z]/.test(next)) {
      i = lt + 1;
      continue;
    }
    const end = endOfTag(source, lt);
    const raw = source.slice(lt + 1, end - 1);
    const selfClosing = raw.trimEnd().endsWith('/');
    const nameMatch = /^([A-Za-z][A-Za-z0-9_.]*)/.exec(raw);
    const name = nameMatch ? nameMatch[1] : '';
    const attrs = nameMatch ? raw.slice(nameMatch[1].length) : raw;
    const children = selfClosing ? '' : source.slice(end, endOfElement(source, name, end));
    elements.push({ name, attrs, children, selfClosing, start: lt, end });
    i = end;
  }
  return elements;
}

// ─────────────────────────────────────────────────────────────────────────────
// StyleSheet extraction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map style name -> body text for every `StyleSheet.create({...})` block in a file.
 * Handles both `key: {` and `'key': {` and one level of nesting (pressed states).
 */
function styleSheets(source) {
  const map = new Map();
  let cursor = 0;
  for (;;) {
    const at = source.indexOf('StyleSheet.create(', cursor);
    if (at < 0) break;
    let i = source.indexOf('{', at);
    if (i < 0) break;
    let depth = 0;
    const start = i;
    for (; i < source.length; i += 1) {
      if (source[i] === '{') depth += 1;
      else if (source[i] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    const body = source.slice(start + 1, i);
    for (const match of body.matchAll(/(?:^|[,{\s])'?([A-Za-z_$][A-Za-z0-9_$]*)'?\s*:\s*\{/g)) {
      let d = 0;
      let j = match.index + match[0].length - 1;
      const valueStart = j;
      for (; j < body.length; j += 1) {
        if (body[j] === '{') d += 1;
        else if (body[j] === '}') {
          d -= 1;
          if (d === 0) break;
        }
      }
      map.set(match[1], body.slice(valueStart + 1, j));
    }
    cursor = i;
  }
  return map;
}

/** Numeric property from a style body, following `...spread` references one level. */
function styleNumber(sheet, name, property, seen = new Set()) {
  if (seen.has(name)) return null;
  seen.add(name);
  const body = sheet.get(name);
  if (body === undefined) return null;
  const direct = new RegExp(`(?:^|[,{\\s])'?${property}'?\\s*:\\s*(-?[0-9.]+)`).exec(body);
  if (direct) return Number(direct[1]);
  for (const spread of body.matchAll(/\.\.\.([A-Za-z_$][A-Za-z0-9_$]*)/g)) {
    const inherited = styleNumber(sheet, spread[1], property, seen);
    if (inherited !== null) return inherited;
  }
  return null;
}

/** Every style name referenced by a `styles.<name>` expression in `text`. */
function styleRefs(text) {
  return [...text.matchAll(/styles\.([A-Za-z0-9_]+)/g)].map((m) => m[1]);
}

/**
 * The symbol a control draws instead of words, or nothing when it draws words.
 *
 * Rule 27's icons are `Text` nodes holding a symbol, and the one in Bible is
 * written as an escape (`{favorit ? '\u2665' : '\u2661'}`), so both the literal
 * character and the `\uXXXX` form have to be understood. A `<Text>{count}</Text>`
 * is not an icon: after unwrapping the expression there is no symbol left, only a
 * value, and an icon rule that fires there would be noise. Whatever is left after
 * the symbols are removed is returned in `leftover`, which the caller requires to
 * be empty.
 */
function symbolsIn(text) {
  const list = [];
  const rest = text
    .replace(/\\u([0-9a-fA-F]{4})/g, (_match, hex) => {
      list.push(String.fromCodePoint(parseInt(hex, 16)));
      return ' ';
    })
    .replace(/\\x([0-9a-fA-F]{2})/g, (_match, hex) => {
      list.push(String.fromCodePoint(parseInt(hex, 16)));
      return ' ';
    });
  const leftover = [];
  for (const character of rest) {
    if (/\s/.test(character)) continue;
    if (DECORATIVE_CHAR.test(character) || /[,;.()|]/.test(character)) {
      list.push(character);
      continue;
    }
    leftover.push(character);
  }
  return { list: list.filter((character) => DECORATIVE_CHAR.test(character)), leftover: leftover.join('') };
}

/**
 * The symbols a `Text` body renders, plus what is left over.
 *
 * `values` counts the expressions that render a value rather than a symbol —
 * `{day}`, `{count}` — because a control that prints a number is not an icon, even
 * though the source contains no letters inside the braces.
 */
function iconGlyphs(raw) {
  const list = [];
  let values = 0;
  const content = raw.replace(/\{[^{}]*\}/g, (expression) => {
    const literals = [...expression.matchAll(/'([^']*)'|"([^"]*)"/g)]
      .map((match) => match[1] ?? match[2]).join(' ');
    const inner = symbolsIn(literals);
    if (inner.list.length === 0) values += 1;
    list.push(...inner.list);
    return ` ${inner.leftover} `;
  });
  const outside = symbolsIn(content);
  list.push(...outside.list);
  return { list, leftover: outside.leftover, values };
}

/**
 * The glyph of an icon-only control, with the fontSize that glyph declares.
 *
 * "Icon-only" is the strict reading: the control draws exactly one symbol and no
 * letters or digits anywhere inside it. A calendar day cell that shows the number
 * *and* a small cross marker is a day cell, not an icon, and rule 27 does not
 * govern it — a first version of this check reported those, which is why the
 * `--self-test` fixtures below include one.
 */
function iconGlyph(element, sheets) {
  let glyph = null;
  for (const child of scanElements(element.children)) {
    if (child.name !== 'Text') continue;
    // Tags inside a Text mean nested copy, not a glyph; and when this runs over a
    // child fragment the closing `</Text>` is part of the string, which would
    // otherwise be read as content.
    const raw = child.children.replace(/<[^>]*>/g, ' ').trim();
    if (raw === '') continue;
    const glyphs = iconGlyphs(raw);
    if (glyphs.leftover !== '' || glyphs.values > 0) return null;
    if (glyphs.list.length === 0) continue;
    if (glyph !== null) return null;
    glyph = styleRefs(child.attrs);
  }
  if (glyph === null) return null;
  const sizes = glyph.map((ref) => styleNumber(sheets, ref, 'fontSize')).filter((value) => value !== null);
  return { refs: glyph, fontSize: sizes.length === 0 ? null : Math.max(...sizes) };
}

/**
 * A control is a back control when the source calls it one — its label's words,
 * its style name, or the handler it runs. `\bback\b` deliberately does not match
 * `backgroundColor`, which appears in attributes all over these screens.
 */
function isBackControl(element) {
  return BACK_WORD.test(element.attrs) || styleRefs(element.attrs).some((ref) => /back/i.test(ref));
}

/** Largest declared minHeight/height/minWidth/width, or null when nothing is declared. */
function targetSize(refs, sheets) {
  let best = null;
  for (const ref of refs) {
    for (const property of ['minHeight', 'height', 'minWidth', 'width']) {
      const value = styleNumber(sheets, ref, property);
      if (value !== null && (property.startsWith('min') || property === 'height')) {
        best = best === null ? value : Math.max(best, value);
      }
    }
  }
  return best;
}

// ─────────────────────────────────────────────────────────────────────────────
// Colour maths (WCAG 2.1)
// ─────────────────────────────────────────────────────────────────────────────

function parseHex(value) {
  const hex = value.trim();
  const short = /^#([0-9a-f]{3})$/i.exec(hex);
  if (short) return short[1].split('').map((c) => parseInt(c + c, 16));
  const full = /^#([0-9a-f]{6})$/i.exec(hex);
  if (full) return [0, 2, 4].map((i) => parseInt(full[1].slice(i, i + 2), 16));
  return null;
}

function channelLuminance(value) {
  const srgb = value / 255;
  return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(rgb) {
  return 0.2126 * channelLuminance(rgb[0]) + 0.7152 * channelLuminance(rgb[1]) + 0.0722 * channelLuminance(rgb[2]);
}

function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Palette token -> opaque #rrggbb. Alpha tokens are skipped (not text backgrounds). */
function readPalette() {
  const source = readFileSync(join(ROOT, 'src', 'constants', 'palette.ts'), 'utf8');
  const tokens = new Map();
  for (const match of source.matchAll(/^\s{2}([A-Za-z]+):\s*'(#[0-9A-Fa-f]{3,6})'/gm)) {
    tokens.set(match[1], match[2]);
  }
  return tokens;
}

/**
 * The shipped palette, read on first use rather than at import: `--self-test` never
 * checks contrast, and it must stay runnable from a copy of this file outside the repo.
 */
let paletteCache = null;
function paletteTokens() {
  if (paletteCache === null) paletteCache = readPalette();
  return paletteCache;
}

/**
 * Text/background pairs actually shipped. Kept as an explicit list rather than
 * inferred, because a wrong inference would produce a confident wrong verdict.
 * `required` is the WCAG 2.1 AA floor: 4.5:1 for normal text, 3:1 for an
 * interactive control's boundary or large text.
 */
const CONTRAST_PAIRS = [
  ['body text', 'ink', 'background', 4.5],
  ['body text on cards', 'ink', 'card', 4.5],
  ['body text on sky', 'ink', 'skyLight', 4.5],
  ['body text on alt cards', 'ink', 'cardAlt', 4.5],
  ['body text on soft blue', 'ink', 'blueSoft', 4.5],
  ['secondary text', 'muted', 'background', 4.5],
  ['secondary text on cards', 'muted', 'card', 4.5],
  ['secondary text on alt cards', 'muted', 'cardAlt', 4.5],
  ['secondary text on sky', 'muted', 'skyLight', 4.5],
  ['secondary text on soft blue', 'muted', 'blueSoft', 4.5],
  ['secondary text on sky token', 'muted', 'sky', 4.5],
  ['eyebrow on sky', 'goldDark', 'skyLight', 4.5],
  ['eyebrow on cards', 'goldDark', 'card', 4.5],
  ['primary button label', 'ink', 'gold', 4.5],
  ['secondary button label', 'blue', 'blueSoft', 4.5],
  ['link on cards', 'blue', 'card', 4.5],
  ['link on sky', 'blue', 'skyLight', 4.5],
  ['link on alt cards', 'blue', 'cardAlt', 4.5],
  ['active tab label', 'primaryInk', 'card', 4.5],
  ['active tab label on sky', 'primaryInk', 'skyLight', 4.5],
  ['success text on cards', 'success', 'card', 4.5],
  ['error text on cards', 'danger', 'card', 4.5],
  ['hero eyebrow on hero', 'goldLight', 'primaryDeep', 4.5],
  ['hero heading on hero', 'background', 'primaryDeep', 4.5],
  // The bright brand blue is a fill, not text: it only has to reach the 3:1
  // non-text contrast floor for a control boundary or an icon.
  ['brand fill on sky', 'primary', 'skyLight', 3],
];

// ─────────────────────────────────────────────────────────────────────────────
// Rules
// ─────────────────────────────────────────────────────────────────────────────

const INTERACTIVE = new Set([
  'Pressable',
  'TouchableOpacity',
  'TouchableHighlight',
  'TouchableWithoutFeedback',
  'Button',
  'Switch',
  'Slider',
]);

const DECORATIVE_OPT_OUT = /(accessible=\{false\}|accessibilityElementsHidden|importantForAccessibility="no(-hide-descendants)?"|aria-hidden)/;
const HAS_LABEL = /(accessibilityLabel|aria-label|accessibilityLabelledBy|aria-labelledby)=/;
const HAS_ROLE = /(accessibilityRole|role)=/;
const MIN_TOUCH = 48;
/** AGENTS.md rule 27: the important icons (cart, favourite) are at least 24pt, in a white circle. */
const MIN_ICON = 24;
/** AGENTS.md rule 28: the back arrow is a 56pt circle. */
const MIN_BACK = 56;
/** A drawn symbol, as opposed to a letter or a digit. */
const DECORATIVE_CHAR = /[\u2000-\u27BF\u2B00-\u2BFF\uFE0F\u20E3]/;
/** "Back" in the ten shipped locales, plus the translation keys that name the action. */
const BACK_WORD = /(inapoi|\bback\b|\u043d\u0430\u0437\u0430\u0434|\u043d\u0430\u0442\u0440\u0430\u0433|\u10e3\u10d9\u10d0\u10dc|\u03c0\u03af\u03c3\u03c9|kthehu)/i;

/** Icon-font glyphs and punctuation used as decoration, not as readable copy. */
const DECORATIVE_TEXT = /^[\s\u2000-\u27BF\u2B00-\u2BFF\uFE0F\u20E3\u2190-\u21FF\u2300-\u23FF\u25A0-\u25FF\u2600-\u27BF·•—–…›«»|/\\+=<>()[\]{}:;,.!?"'`~*#%^&_-]*$/;

/**
 * @param collect  Where findings go. The self-test passes its own collector so a
 *   threshold can be proved to fire without the real tree reporting it.
 */
function checkInteractive(file, source, elements, sheets, collect = report) {
  for (const element of elements) {
    if (!INTERACTIVE.has(element.name)) continue;

    const hasRole = HAS_ROLE.test(element.attrs);
    const hasLabel = HAS_LABEL.test(element.attrs);
    const hasVisibleText = /<Text[\s>]/.test(element.children) || /<[A-Z][A-Za-z]*\.Label[\s/>]/.test(element.children);

    if (!hasRole && !hasLabel) {
      collect('A1', file, `<${element.name}> has neither a role nor a label`,
        'A screen reader announces it as plain text, so the user cannot tell it is actionable.');
    }
    if (!hasVisibleText && !hasLabel && !/accessibilityElementsHidden/.test(element.attrs)) {
      collect('A1', file, `<${element.name}> renders no readable text and carries no label`,
        'Icon-only control: without accessibilityLabel it is announced as an unlabelled button.');
    }

    // Touch target: minHeight/height of the referenced styles, or explicit hitSlop.
    const refs = styleRefs(element.attrs);
    const best = targetSize(refs, sheets);
    const paddingVertical = refs.reduce((acc, ref) => {
      const value = styleNumber(sheets, ref, 'paddingVertical') ?? styleNumber(sheets, ref, 'padding');
      return value === null ? acc : Math.max(acc, value);
    }, 0);
    const inlineHitSlop = /hitSlop=/.test(element.attrs);

    if (best !== null && best < MIN_TOUCH && !inlineHitSlop && paddingVertical === 0) {
      collect('A4', file, `<${element.name}> tap target is ${best}pt tall (styles.${refs.join(',')})`,
        `Google asks for ${MIN_TOUCH}x${MIN_TOUCH}dp and Apple for 44pt; a smaller target is a miss for anyone with a tremor or a large thumb.`);
    }

    // Rule 27: an icon-only control draws a glyph, and the glyph has a floor.
    const glyph = iconGlyph(element, sheets);
    if (glyph) {
      if (glyph.fontSize === null) {
        collect('A8', file, `<${element.name}> draws an icon but no referenced style declares fontSize`,
          'Unmeasurable: the size has to be declared before rule 27 (min 24) can be checked at all.');
      } else if (glyph.fontSize < MIN_ICON) {
        collect('A8', file, `icon glyph is ${glyph.fontSize}pt (styles.${glyph.refs.join(',')})`,
          `AGENTS.md rule 27: the important icons (cart, favourite) are at least ${MIN_ICON} so they stay visible to a low-vision user.`);
      }
    }

    // Rule 28: the back arrow is a 56pt circle.
    if (isBackControl(element)) {
      const size = targetSize(refs, sheets);
      if (size === null || size < MIN_BACK) {
        collect('A9', file, `<${element.name}> back control is ${size === null ? 'undimensioned' : `${size}pt`} (styles.${refs.join(',')})`,
          `AGENTS.md rule 28: the back arrow is a ${MIN_BACK}pt circle; anything smaller is a miss for a thumb on a phone.`);
      }
    }
  }
}

function checkInputs(file, elements) {
  for (const element of elements) {
    if (element.name !== 'TextInput') continue;
    if (HAS_LABEL.test(element.attrs)) continue;
    report('A2', file, '<TextInput> has no accessibilityLabel',
      'The placeholder is not a label: it disappears on the first keystroke and is not announced as the field name.');
  }
}

/**
 * Strict test for "this text would appear on screen".
 *
 * A candidate is copy only when it contains no code punctuation at all and reads
 * like a phrase: several words, or a sentence with terminal punctuation. Code
 * fragments collect around `(`, `)`, `=`, `{`, `}`, `;`, `:`, `|`, `_`, backticks
 * and `=>`, so rejecting any of those removes the false positives wholesale.
 */
const CODE_PUNCTUATION = /[(){}[\];:=|`_\\<>$*#@^~]/;
const CAMEL_CASE = /[a-z][A-Z]/;

function looksLikeCopy(literal) {
  if (!literal || literal.length < 4 || literal.length > 200) return false;
  if (DECORATIVE_TEXT.test(literal)) return false;
  if (COPY_ALLOWLIST.has(literal)) return false;
  if (CODE_PUNCTUATION.test(literal)) return false;
  if (CAMEL_CASE.test(literal)) return false;
  // A dotted identifier (`home.sectionTitle`) is a translation key, not copy.
  if (/^[a-z][A-Za-z0-9.]*\.[A-Za-z0-9.]+$/.test(literal)) return false;
  // A comma-separated lowercase identifier list (`id, role, content`) is a field
  // list in code, never something a person reads.
  if (literal.split(/,\s*/).every((part) => /^[a-z][a-z0-9_]*$/.test(part))) return false;
  // Names, constants and single tokens are labels the corpus would not hold.
  const words = literal.split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;
  // At least two words of real letters, and not an all-caps shout.
  const wordy = words.filter((word) => (word.match(/\p{L}/gu) ?? []).length >= 2);
  if (wordy.length < 2) return false;
  if (/^[\p{Lu}\p{N}\s.·/&+-]+$/u.test(literal)) return false;
  // Sentence copy usually ends in terminal punctuation, a closing mark, or an ellipsis.
  if (/[.!?…:;»)"'’]$/.test(literal)) return true;
  // A title or heading carries no terminal punctuation — `Doamne, luminează-mi calea` is
  // how the real hardcoded string in Home was missed by the first strict version.
  //
  // The signal is a leading capital plus several words whose letters run longer than a
  // two-word code fragment (`string, unknown`, `no data`, `typeof Link`). A first attempt
  // required title case on nearly every word, which no real sentence in these locales
  // satisfies; this rule is checked against both the copy it must catch and the code
  // fragments it must not, in `--self-test`.
  const firstWord = words[0] ?? '';
  const letterCount = literal.replace(/[^\p{L}\p{N}]/gu, '').length;
  return /^\p{Lu}/u.test(firstWord) && words.length >= 3 && letterCount / words.length >= 4;
}


function checkImages(file, elements) {
  for (const element of elements) {
    if (element.name !== 'Image' && element.name !== 'ExpoImage') continue;
    if (HAS_LABEL.test(element.attrs) || DECORATIVE_OPT_OUT.test(element.attrs)) continue;
    report('A3', file, `<${element.name}> is neither labelled nor marked decorative`,
      'Add accessibilityLabel when it carries meaning, or accessible={false} when it is decoration.');
  }
}

/**
 * Headings.
 *
 * A6 is checked at the *definition* of the shared heading components, not at every
 * call site: PageHeader and SectionTitle are defined once in src/components/mvp-ui.tsx
 * and adding the role there covers all 22 usages. Checking call sites would report
 * 22 findings for one decision and would push the role into screens where it does
 * not belong.
 */
const HEADING_COMPONENTS = new Set(['PageHeader', 'SectionTitle']);

function checkHeadings(file, source) {
  for (const match of source.matchAll(/(?:export\s+)?function\s+([A-Z][A-Za-z0-9]*)\s*\(/g)) {
    const name = match[1];
    if (!HEADING_COMPONENTS.has(name)) continue;
    // The heading text node must carry the role within this component's body.
    const body = source.slice(match.index, match.index + 2000);
    if (/accessibilityRole="header"|role="heading"/.test(body)) continue;
    report('A6', file, `${name} does not mark its title as a heading`,
      'VoiceOver and TalkBack expose a heading rotor/shortcut only when the node carries the heading role.');
  }
}

/**
 * Literal copy that reaches the screen without going through t().
 *
 * Brand and vendor names are excluded on purpose: a screen reader must pronounce
 * "Supabase", "RevenueCat" and "Google Play" as the names they are, in every
 * locale, so translating them would be a defect rather than a fix.
 */
const COPY_ALLOWLIST = new Set([
  'Supabase', 'OpenAI', 'RevenueCat', 'Apple App Store / Google Play',
  'YouTube Data API', 'Expo / React Native', 'Expo', 'Google Play', 'App Store',
]);

function checkHardcodedCopy(file, source) {
  // Only .tsx files render JSX. A .ts file holds logic and the translation corpus
  // (src/i18n/config.ts is 538KB of key/value pairs); scanning it for "copy" is
  // meaningless and produced hundreds of false positives.
  if (!file.endsWith('.tsx')) return;
  for (const node of scanTextNodes(source)) {
    const literal = node.text.replace(/\s+/g, ' ').trim();
    if (!looksLikeCopy(literal)) continue;
    report('A7', file, `hardcoded UI copy: ${JSON.stringify(literal.slice(0, 60))}`,
      'Every user-visible string must come from the corpus so all 10 locales and both screen readers agree.');
  }
}

function checkContrast() {
  const file = join(ROOT, 'src', 'constants', 'palette.ts');
  const PALETTE = paletteTokens();
  for (const [label, fgToken, bgToken, required] of CONTRAST_PAIRS) {
    const fg = parseHex(PALETTE.get(fgToken) ?? '');
    const bg = parseHex(PALETTE.get(bgToken) ?? '');
    if (!fg || !bg) {
      report('A5', file, `palette token missing for "${label}" (${fgToken} on ${bgToken})`, null);
      continue;
    }
    const ratio = contrastRatio(fg, bg);
    if (ratio < required) {
      report('A5', file,
        `${label}: ${PALETTE.get(fgToken)} on ${PALETTE.get(bgToken)} is ${ratio.toFixed(2)}:1 (needs ${required}:1)`,
        'Below WCAG AA the text is unreadable in sunlight or for a low-vision user.');
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Report
// ─────────────────────────────────────────────────────────────────────────────

const RULE_TITLES = {
  A1: 'interactive control without a role/label',
  A2: 'input without a label',
  A3: 'image without a label or decorative marker',
  A4: 'tap target below 48dp',
  A5: 'contrast below WCAG AA',
  A6: 'heading not announced',
  A7: 'hardcoded user-visible copy',
  A8: 'icon below 24pt or outside its circle',
  A9: 'back control below 56pt',
};

/**
 * Self-test for the scanners, run with `--self-test`.
 *
 * The text scanner is the part of this script that failed in practice: its first two
 * versions reported TypeScript generics (`Promise<void>`), `try`, `catch` and every
 * StyleSheet key as hardcoded UI copy. A checker nobody trusts is worse than no check,
 * so the exact inputs that fooled it are pinned here — and `npm run safety` runs this.
 */
function runSelfTest() {
  const failures = [];
  let checks = 0;

  const expect = (label, actual, wanted) => {
    checks += 1;
    const a = JSON.stringify(actual);
    const w = JSON.stringify(wanted);
    if (a === w) {
      console.log(`PASS  ${label}`);
    } else {
      console.log(`FAIL  ${label}: got ${a}, wanted ${w}`);
      failures.push(label);
    }
  };

  const copyIn = (source) => scanTextNodes(source)
    .map((node) => node.text.replace(/\s+/g, ' ').trim())
    .filter((literal) => looksLikeCopy(literal));

  expect(
    'real screen copy is found',
    copyIn('<Text style={styles.t}>Doamne, lumineaza-mi calea</Text>'),
    ['Doamne, lumineaza-mi calea'],
  );

  expect(
    'copy with a nested element is still found',
    copyIn('<Text style={styles.t}>Bine ai venit in aplicatie <Text style={styles.b}>astazi</Text></Text>'),
    ['Bine ai venit in aplicatie'],
  );

  expect(
    'a TypeScript generic is not copy',
    copyIn('const [session, setSession] = useState<Session | null>(null);\nfunction f(): Promise<void> {}\n'),
    [],
  );

  expect(
    'bare keywords in code are not copy',
    copyIn('try {\n  await supabase.auth.getSession();\n} catch (error) {\n  console.error(error);\n}\n'),
    [],
  );

  expect(
    'a StyleSheet key is not copy',
    copyIn('const styles = StyleSheet.create({ bookButton: { height: 44 } });'),
    [],
  );

  expect(
    'a translation key is not copy',
    copyIn('const label = t("home.parableSectionTitle");'),
    [],
  );

  expect(
    'a string constant is not copy',
    copyIn('const message = "Dictarea nu a putut porni.";'),
    [],
  );

  const sheets = styleSheets('const styles = StyleSheet.create({ small: { height: 36 }, big: { minHeight: 50 } });');
  expect('a style height is read', styleNumber(sheets, 'small', 'height'), 36);
  expect('a style minHeight is read', styleNumber(sheets, 'big', 'minHeight'), 50);
  expect('a missing style returns null', styleNumber(sheets, 'nope', 'height'), null);

  /**
   * The A4/A8/A9 thresholds are worth having only if they fire on the exact shape
   * rules 27 and 28 describe and stay quiet next to it — a 24pt glyph inside a
   * circle and a number rendered in a Text are both clean. Each fixture below is
   * the smallest source that reproduces the rule.
   */
  const interactiveFindings = (source) => {
    const collected = [];
    checkInteractive('<self-test>', source, scanElements(source), styleSheets(source),
      (rule, _file, message) => collected.push(`${rule} ${message}`));
    return collected;
  };
  const iconFixture = `<Pressable accessibilityRole="button" accessibilityLabel={t('prayers.favoriteAdd')} hitSlop={8} style={styles.iconButton}>
  <Text style={styles.icon}>{favorit ? '\\u2665' : '\\u2661'}</Text>
</Pressable>
const styles = StyleSheet.create({ iconButton: { borderRadius: 999 }, icon: { fontSize: SIZE } });`;
  const dayCellFixture = `<Pressable accessibilityRole="button" accessibilityLabel="x" hitSlop={8} style={styles.day}>
  <Text style={styles.dayText}>{day}</Text>
  <Text style={styles.marker}>\\u271d</Text>
</Pressable>
const styles = StyleSheet.create({ day: { borderRadius: 10 }, dayText: { fontSize: 13 }, marker: { fontSize: 9 } });`;
  const backFixture = (size) => `<Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => router.back()} style={styles.backButton}>
  <Text style={styles.backIcon}>\\u2190</Text>
</Pressable>
const styles = StyleSheet.create({ backButton: { width: ${size}, height: ${size}, borderRadius: ${size / 2} }, backIcon: { fontSize: 24 } });`;
  const targetFixture = (size) => `<Pressable accessibilityRole="button" accessibilityLabel="x" style={styles.b}><Text style={styles.t}>ok</Text></Pressable>
const styles = StyleSheet.create({ b: { minHeight: ${size} }, t: { fontSize: 14 } });`;

  const atSize = (fixture, size) => fixture.replace('SIZE', String(size));
  const sizedIcon = (size) => atSize(iconFixture, size);
  const undeclaredIcon = iconFixture.replace('fontSize: SIZE', "color: '#000000'");

  expect('a 20pt icon is below rule 27',
    interactiveFindings(sizedIcon(20)).filter((entry) => entry.startsWith('A8')).length, 1);
  expect('a 24pt icon passes rule 27', interactiveFindings(sizedIcon(24)), []);
  expect('an icon with no declared size is reported',
    interactiveFindings(undeclaredIcon).filter((entry) => entry.startsWith('A8')).length, 1);
  expect('a day cell with a number and a marker is not an icon',
    interactiveFindings(dayCellFixture).filter((entry) => entry.startsWith('A8')).length, 0);
  expect('a value in a Text is not an icon', interactiveFindings(targetFixture(48)), []);
  expect('a 40pt back control is below rule 28',
    interactiveFindings(backFixture(40)).filter((entry) => entry.startsWith('A9')).length, 1);
  expect('a 56pt back control passes rule 28',
    interactiveFindings(backFixture(56)).filter((entry) => entry.startsWith('A9')).length, 0);
  expect('a 44pt control is below the 48dp floor',
    interactiveFindings(targetFixture(44)).filter((entry) => entry.startsWith('A4')).length, 1);
  expect('a 48pt control reaches the floor',
    interactiveFindings(targetFixture(48)).filter((entry) => entry.startsWith('A4')).length, 0);

  const contract = checkContrastMaths();

  console.log('');
  console.log(`  ${checks} parser check(s), contrast reference ${contract}`);
  if (failures.length > 0) {
    for (const failure of failures) console.log(`FAIL  ${failure}`);
    console.log(`SELF-TEST: FAILED (${failures.length}).`);
    process.exitCode = 1;
    return;
  }
  console.log('SELF-TEST: OK — the scanner separates screen copy from code, and the style reader works.');
}

/**
 * The WCAG contrast maths is the other place a silent error is possible, so it is
 * checked against the two published reference ratios: black on white is 21:1 and any
 * colour against itself is 1:1.
 */
function checkContrastMaths() {
  const white = parseHex('#FFFFFF');
  const black = parseHex('#000000');
  const whiteOnBlack = contrastRatio(white, black);
  const same = contrastRatio(white, white);
  if (Math.abs(whiteOnBlack - 21) > 0.01) {
    console.log(`FAIL  black on white should be 21:1, computed ${whiteOnBlack.toFixed(2)}`);
    process.exitCode = 1;
    return 'INVALID';
  }
  if (Math.abs(same - 1) > 0.001) {
    console.log(`FAIL  a colour against itself should be 1:1, computed ${same.toFixed(3)}`);
    process.exitCode = 1;
    return 'INVALID';
  }
  console.log('PASS  black on white is 21:1 and a colour against itself is 1:1');
  return 'verified';
}

function main() {
  if (process.argv.includes('--self-test')) {
    runSelfTest();
    return;
  }
  const SOURCE_FILES = sourceFiles();
  for (const file of SOURCE_FILES) {
    const source = readFileSync(file, 'utf8');
    const elements = scanElements(source);
    const sheets = styleSheets(source);
    checkInteractive(file, source, elements, sheets);
    checkInputs(file, elements);
    checkImages(file, elements);
    checkHeadings(file, source);
    checkHardcodedCopy(file, source);
  }
  checkContrast();

  const byRule = new Map();
  for (const finding of findings) {
    if (!byRule.has(finding.rule)) byRule.set(finding.rule, []);
    byRule.get(finding.rule).push(finding);
  }

  console.log('Ortodoxia accessibility audit');
  console.log(`${SOURCE_FILES.length} source file(s) scanned, ${findings.length} finding(s)`);
  console.log('');

  if (findings.length === 0) {
    console.log('No findings. Every control has a role or label, every input a label,');
    console.log('every tap target reaches 48dp, every rule 27 icon clears its 24pt floor,');
    console.log('every back control clears 56pt, and every shipped colour pair passes WCAG AA.');
    // Rule 27 also asks for each icon to sit in a white circle. That part is a design
    // statement, not a measurable one (a wrapper View draws the circle, and on an all
    // white bar it would be invisible), so it is verified by eye on the store capture
    // and by `tests/tab-icons-rule-27.test.mjs` for the tab bar — never claimed here.
    return;
  }

  for (const rule of Object.keys(RULE_TITLES).sort()) {
    const list = byRule.get(rule) ?? [];
    console.log(`${rule}  ${RULE_TITLES[rule]} — ${list.length}`);
    const shown = LIST_ALL ? list : list.slice(0, 8);
    for (const finding of shown) {
      console.log(`    ${finding.file}`);
      console.log(`      ${finding.message}`);
      if (finding.detail) console.log(`      → ${finding.detail}`);
    }
    if (!LIST_ALL && list.length > shown.length) console.log(`    … ${list.length - shown.length} more (run with --list)`);
    console.log('');
  }

  process.exitCode = 1;
}

export {
  looksLikeCopy,
  scanTextNodes,
  scanElements,
  styleSheets,
  styleNumber,
  styleRefs,
  iconGlyphs,
  iconGlyph,
  isBackControl,
  targetSize,
  contrastRatio,
  parseHex,
};
main();
