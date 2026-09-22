#!/usr/bin/env node
/**
 * Startup budget for the Ortodoxia app.
 *
 * WHAT THIS PROTECTS
 * ------------------
 * The app must reach its first screen without evaluating the modules that only the
 * Premium screen, the chat screen or Moldova ever need. Those modules are measured:
 *
 *   react-native-purchases / Play Billing   ~1.1MB of the bundle
 *   the two Moldova calendar seeds          ~300KB
 *   the RevenueCat wrapper                  pulls the purchases SDK
 *   the translation corpus and Supabase     ~650KB, needed on the first screen
 *
 * HOW IT MEASURES — AND WHY NOT BY GUESSING
 * -----------------------------------------
 * Two earlier drafts of this file were wrong, and both failures are worth recording
 * so nobody repeats them:
 *
 *   1. The first tried to infer eager evaluation from `require(_dependencyMap[N])`
 *      sites. Metro emits the dependency array (`__d(fn, 0, [1, 2])`) for *every*
 *      dependency whether or not it is required at module scope, so graph
 *      reachability said "5 modules evaluated" when the real answer is hundreds.
 *
 *   2. The second matched module-scope requires by indentation, which missed the
 *      `(0, require(_dependencyMap[5]).setLocationHref)(url)` form entirely.
 *
 * This version tracks brace depth while scanning the module body: a `require` seen at
 * depth 0 (inside the factory body, not inside any function) is a module-scope
 * require, and it is exactly what `inlineRequires: false` produces. The script then
 * walks that module-scope graph from the entry roots — the `__r(n)` calls Metro emits
 * at the end of the bundle — and reports which of the heavy modules are reachable.
 *
 * The bundle is produced by a real `expo export`, so the answer describes what ships
 * rather than what the source looks like it does.
 *
 * Usage:
 *   node scripts/startup-budget.mjs             # export, then check (~1-2 min)
 *   node scripts/startup-budget.mjs --reuse     # analyse the previous export
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT_DIR = join(ROOT, 'work', 'startup-budget');
const REUSE = process.argv.includes('--reuse');

/**
 * `--bundle <file>` inspects an already-produced bundle instead of exporting one, so a
 * bundle captured before a change can be re-measured with the same parser.
 */
const BUNDLE_FLAG = process.argv.indexOf('--bundle');
const BUNDLE_PATH = BUNDLE_FLAG >= 0 ? process.argv[BUNDLE_FLAG + 1] : null;

/**
 * Ceiling for the number of module-scope requires in the bundle.
 *
 * WHAT THIS NUMBER MEANS, AND WHAT IT DOES NOT
 * -------------------------------------------
 * A module-scope require is a dependency evaluated before the first screen can draw.
 * Both bundles were measured with this same parser:
 *
 *   before `inlineRequires: true`   3945 module-scope requires, 1479 modules
 *   after                           2290 module-scope requires, 1478 modules
 *
 * The counter is deliberately literal — it counts `require(_dependencyMap[n])` calls
 * that are not enclosed in any braces — so a require inside a braceless arrow body is
 * counted even though it runs on demand. The absolute value is therefore an upper
 * bound, and only its *movement* is meaningful.
 *
 * The budget sits between the two measurements: re-enabling eager evaluation (or
 * removing the Metro option, or importing a new heavyweight module at the top of a
 * screen) pushes the count back over this line and fails the check with the number in
 * the message. The per-module checks below are the precise ones; this is the tripwire.
 */
const MAX_MODULE_SCOPE_REQUIRES = 3000;

/**
 * Ceiling for the JavaScript the device downloads and Hermes parses at launch.
 * Measured at 7.64MB (unminified, uncompressed) when this check was introduced; a
 * minified release bundle is far smaller, so this is a regression tripwire rather
 * than a target.
 */
const MAX_BUNDLE_BYTES = 8_400_000;

/**
 * Modules that must NOT be pulled in at module scope by anything in the bundle.
 *
 * WHY THIS IS THE RIGHT TEST
 * --------------------------
 * With inline requires, whether a module is evaluated depends on which function runs
 * first, which a static reader cannot know. What it *can* know is that no module
 * declares a module-scope require for these — the only way they could be evaluated
 * before the first screen. That is the property Metro's option buys, so that is the
 * property this script checks.
 */
const MUST_BE_LAZY = [
  {
    name: 'Play Billing via react-native-purchases',
    probe: 'PURCHASES_ERROR_CODE',
    why: 'The store is only used by the Premium screen; the free app never opens it.',
  },
  {
    name: 'Moldova calendar seed — Basarabia',
    probe: 'Sf. Mc. Bonifatie; Sf. Cuv. Ilie',
    why: 'Liturgical rows for one country; twelve of the thirteen countries never read them.',
  },
  {
    name: 'Moldova calendar seed — Chișinău',
    probe: 'Sf. Mc. Bonifatie și Dreapta Aglaida',
    why: 'Liturgical rows for one calendar variant of one country.',
  },
  {
    name: 'RevenueCat wrapper (src/lib/revenuecat.ts)',
    probe: 'configureRevenueCat',
    why: 'Imports the native purchases SDK; only the Premium screen and the chat quota banner use it.',
  },
];

const EXPORT_TIMEOUT_MS = 15 * 60 * 1000;

function exportBundle() {
  if (BUNDLE_PATH) return true;
  if (REUSE) {
    if (!existsSync(OUT_DIR)) {
      console.error(`--reuse was passed but ${OUT_DIR} does not exist.`);
      process.exitCode = 1;
      return false;
    }
    console.log(`Reusing the export in ${OUT_DIR}`);
    return true;
  }
  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true });
  console.log('Exporting the Android bundle (Metro, unminified, no bytecode)…');
  // The Expo CLI is invoked through the current Node binary rather than `npx`, because
  // Node refuses to spawn a `.cmd` shim without a shell on Windows (`spawnSync npx.cmd
  // EINVAL`), and `npm test` already relies on Node's own executable being usable.
  const cli = join(ROOT, 'node_modules', 'expo', 'bin', 'cli');
  if (!existsSync(cli)) {
    console.error('node_modules/expo/bin/cli is missing — run `npm install` first.');
    process.exitCode = 1;
    return false;
  }
  execFileSync(
    process.execPath,
    [cli, 'export', '--platform', 'android', '--output-dir', OUT_DIR, '--no-bytecode', '--no-minify'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'], timeout: EXPORT_TIMEOUT_MS },
  );
  return true;
}

function findBundle() {
  const dir = join(OUT_DIR, '_expo', 'static', 'js', 'android');
  if (!existsSync(dir)) return null;
  const entry = readdirSync(dir).find((name) => name.startsWith('entry-') && name.endsWith('.js'));
  return entry ? join(dir, entry) : null;
}

/**
 * Split the bundle into module factories.
 *
 * Each factory is `__d(function (...) { ... }, <id>, [<deps>]);`. The end of a module
 * is the end of its factory's parameter list, not the start of the next `__d` — the
 * text in between carries the *previous* module's terminator plus everything that
 * follows it, which is why a simple "next marker" split made the module-scope require
 * of module 0 land in module 1 and reported five evaluated modules instead of hundreds.
 */
function parseModules(source) {
  const starts = [];
  const marker = /^__d\(function/gm;
  let match;
  while ((match = marker.exec(source)) !== null) starts.push(match.index);
  starts.push(source.length);

  const modules = [];
  for (let i = 0; i < starts.length - 1; i += 1) {
    const text = source.slice(starts[i], starts[i + 1]);
    modules.push({
      index: i,
      line: source.slice(0, starts[i]).split('\n').length,
      bytes: text.length,
      text,
      moduleScopeDeps: moduleScopeRequires(text),
    });
  }
  return modules;
}

/**
 * Dependency ids required at module scope — inside the factory function body but not
 * inside any nested function.
 *
 * The factory's own parameter list contains no braces, so the first `{` opens the
 * body at depth 1; a `require` seen at depth 1 is module scope and depth 2 or more is
 * inside a function, which `inlineRequires: true` produces instead. Braces inside
 * strings, template literals and comments are skipped: a translation string holding a
 * bare `{` would otherwise shift the depth for the rest of the module.
 */
function moduleScopeRequires(text) {
  const deps = new Set();
  const bodyStart = text.indexOf('{');
  if (bodyStart < 0) return [];

  let depth = 0;
  let i = bodyStart;
  let mode = 'code';

  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];

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
    if (mode === 'string') {
      if (ch === '\\') i += 2;
      else if (ch === '"' || ch === "'") {
        mode = 'code';
        i += 1;
      } else i += 1;
      continue;
    }
    if (mode === 'template') {
      if (ch === '\\') i += 2;
      else if (ch === '`') {
        mode = 'code';
        i += 1;
      } else i += 1;
      continue;
    }

    if (ch === '/' && next === '/') {
      mode = 'line-comment';
      i += 2;
      continue;
    }
    if (ch === '/' && next === '*') {
      mode = 'block-comment';
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      mode = 'string';
      i += 1;
      continue;
    }
    if (ch === '`') {
      mode = 'template';
      i += 1;
      continue;
    }
    if (ch === '{') {
      depth += 1;
      i += 1;
      continue;
    }
    if (ch === '}') {
      depth -= 1;
      i += 1;
      continue;
    }
    if (depth === 1 && text.startsWith('require(_dependencyMap[', i)) {
      const requireMatch = /^require\(_dependencyMap\[(\d+)\]\)/.exec(text.slice(i));
      if (requireMatch) {
        deps.add(Number(requireMatch[1]));
        i += requireMatch[0].length;
        continue;
      }
    }
    i += 1;
  }
  return [...deps];
}

/** The module ids Metro evaluates at the end of the bundle (`__r(4);` etc.). */
function entryRoots(source) {
  const roots = [];
  for (const match of source.matchAll(/^__r\((\d+)\);$/gm)) roots.push(Number(match[1]));
  return roots.length > 0 ? roots : [0];
}

/**
 * Unit checks for the two parsers, run with `--self-test`.
 *
 * The parsers are the whole reason this script can be trusted, and both went through
 * a wrong version, so they are tested directly on literal bundle fragments rather than
 * only through a full export.
 */
function runSelfTest() {
  const failures = [];
  const expect = (label, actual, wanted) => {
    const a = JSON.stringify(actual);
    const w = JSON.stringify(wanted);
    if (a === w) console.log(`PASS  ${label}`);
    else {
      console.log(`FAIL  ${label}: got ${a}, wanted ${w}`);
      failures.push(label);
    }
  };

  const eagerFragment = '__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {\n'
    + '  "use strict";\n\n  require(_dependencyMap[0]);\n},0,[1]);';
  expect('module-scope require is detected', moduleScopeRequires(eagerFragment), [0]);

  const lazyFragment = '__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {\n'
    + '  "use strict";\n  function load() {\n    return require(_dependencyMap[3]);\n  }\n  load();\n},7,[3]);';
  expect('a require inside a function is not module scope', moduleScopeRequires(lazyFragment), []);

  const guardedFragment = '__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {\n'
    + '  "use strict";\n  if (typeof window !== "undefined") {\n    (0, require(_dependencyMap[5]).setLocationHref)(url);\n  }\n},7,[5]);';
  expect('a require inside a block is not module scope', moduleScopeRequires(guardedFragment), []);

  const braceInString = '__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {\n'
    + '  var a = "{ not a brace";\n  require(_dependencyMap[2]);\n},9,[2]);';
  expect('a brace inside a string does not shift the depth', moduleScopeRequires(braceInString), [2]);

  const twoModules = `${eagerFragment}\n${lazyFragment}`;
  const parsed = parseModules(twoModules);
  expect('the bundle is split into two modules', parsed.length, 2);
  expect('module 0 keeps its module-scope require', parsed[0].moduleScopeDeps, [0]);
  expect('module 1 is not credited with module 0\'s require', parsed[1].moduleScopeDeps, []);

  console.log('');
  if (failures.length > 0) {
    console.log(`SELF-TEST: FAILED (${failures.length}).`);
    process.exitCode = 1;
    return;
  }
  console.log('SELF-TEST: OK — the bundle parser reads module scope correctly.');
}

function main() {
  const selfTest = process.argv.includes('--self-test');
  if (selfTest) {
    runSelfTest();
    return;
  }
  if (!exportBundle()) return;
  const bundle = BUNDLE_PATH ?? findBundle();
  if (!bundle) {
    console.error(`No Android bundle found in ${OUT_DIR}; the export produced none.`);
    process.exitCode = 1;
    return;
  }

  const source = readFileSync(bundle, 'utf8');
  const modules = parseModules(source);

  // Which module ids does anything require at module scope? Those are the only
  // dependencies that can be evaluated before the first screen. With inline requires
  // the list is nearly empty, and each entry left is a deliberate synchronous need.
  const eagerlyRequired = new Map();
  let moduleScopeRequireCount = 0;
  for (const module of modules) {
    for (const dep of module.moduleScopeDeps) {
      moduleScopeRequireCount += 1;
      if (!eagerlyRequired.has(dep)) eagerlyRequired.set(dep, []);
      eagerlyRequired.get(dep).push(module.index);
    }
  }

  console.log('');
  console.log('Ortodoxia startup budget');
  console.log(`  bundle               : ${(source.length / 1024 / 1024).toFixed(2)}MB, ${modules.length} module(s)`);
  console.log(`  module-scope requires: ${moduleScopeRequireCount} (each one runs before the first screen)`);
  console.log('');

  const failures = [];

  if (source.length > MAX_BUNDLE_BYTES) {
    failures.push(`bundle is ${(source.length / 1024 / 1024).toFixed(2)}MB, budget is ${(MAX_BUNDLE_BYTES / 1024 / 1024).toFixed(2)}MB`);
    console.log(`FAIL  bundle exceeds the ${(MAX_BUNDLE_BYTES / 1024 / 1024).toFixed(2)}MB budget`);
  } else {
    console.log(`PASS  bundle fits the ${(MAX_BUNDLE_BYTES / 1024 / 1024).toFixed(2)}MB budget`);
  }

  if (moduleScopeRequireCount > MAX_MODULE_SCOPE_REQUIRES) {
    failures.push(`${moduleScopeRequireCount} module-scope requires, budget is ${MAX_MODULE_SCOPE_REQUIRES}`);
    console.log(`FAIL  ${moduleScopeRequireCount} module-scope requires (budget ${MAX_MODULE_SCOPE_REQUIRES})`);
    console.log('      Metro is evaluating the dependency graph at launch again — check `inlineRequires` in metro.config.js.');
  } else {
    console.log(`PASS  ${moduleScopeRequireCount} module-scope require(s), within the ${MAX_MODULE_SCOPE_REQUIRES} budget`);
  }

  const find = (probe) => modules.find((module) => module.text.includes(probe)) ?? null;

  for (const entry of MUST_BE_LAZY) {
    const module = find(entry.probe);
    if (!module) {
      failures.push(`${entry.name}: probe string not found in the bundle`);
      console.log(`FAIL  ${entry.name}: not found (is the probe string still valid?)`);
      continue;
    }
    const parents = eagerlyRequired.get(module.index) ?? [];
    if (parents.length > 0) {
      failures.push(`${entry.name} is required at module scope by ${parents.length} module(s)`);
      console.log(`FAIL  ${entry.name} (${Math.round(module.bytes / 1024)}KB) is required at module scope of module(s) ${parents.slice(0, 6).join(', ')}`);
      console.log(`      ${entry.why}`);
    } else {
      console.log(`PASS  ${entry.name} is deferred (${Math.round(module.bytes / 1024)}KB loaded on first use only)`);
    }
  }

  console.log('');
  if (failures.length > 0) {
    console.log(`STARTUP BUDGET: FAILED (${failures.length} check(s)).`);
    process.exitCode = 1;
    return;
  }
  console.log('STARTUP BUDGET: OK — the first screen does not wait for the store SDK or the Moldova seeds.');
}

main();
