#!/usr/bin/env node
/**
 * Inserts the paywall store-state strings into every locale of `src/i18n/config.ts`:
 *
 *   premium.deviceCannotPurchase — the device cannot buy from the store at all (no
 *                                  Play Store / App Store here), and it must read as
 *                                  an environment fact, not as an app defect;
 *   premium.storeNoOfferings     — the store returned no offering for this account;
 *   premium.priceUnavailable     — the package exists but the store sent no price, so
 *                                  the screen shows no price and the button stays off.
 *
 * These accompany the paywall fix that makes the purchase button follow the real store
 * state instead of the RevenueCat catalog (measured 2026-10-08: a sideloaded build kept
 * an active button and a catalog price while Google Play answered "The item you were
 * attempting to purchase could not be found.").
 *
 * The values live in `scripts/i18n-additions/paywall-store-state.mjs` so the operation is
 * auditable and repeatable rather than a one-off hand edit across ten language blocks.
 *
 * Idempotent: keys already present are left untouched.
 *
 * Usage:
 *   node scripts/add-paywall-store-keys.mjs           # check, report what is missing
 *   node scripts/add-paywall-store-keys.mjs --write   # insert
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PAYWALL_STORE_STATE_VALUES } from './i18n-additions/paywall-store-state.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const I18N_PATH = join(ROOT, 'src', 'i18n', 'config.ts');

const WRITE = process.argv.includes('--write');
const LOCALES = ['ro', 'en', 'el', 'sr', 'bg', 'mk', 'uk', 'ka', 'ru', 'sq'];

/** Each group is inserted after its own anchor key. */
const GROUPS = [
  { name: 'paywall store state', anchor: 'premium.planUnavailable', values: PAYWALL_STORE_STATE_VALUES },
];

function main() {
  let source = readFileSync(I18N_PATH, 'utf8');

  const blocks = [...source.matchAll(/^const (ro|en|el|sr|bg|mk|uk|ka|ru|sq) = \{$/gm)]
    .map((match) => ({ locale: match[1], start: match.index }));
  if (blocks.length !== LOCALES.length) {
    console.error(`FAIL — expected ${LOCALES.length} locale blocks, found ${blocks.length}`);
    process.exitCode = 1;
    return;
  }

  const adjustments = [];
  let totalPending = 0;

  for (const group of GROUPS) {
    let pending = 0;

    for (let index = 0; index < blocks.length; index += 1) {
      const { locale, start } = blocks[index];
      const end = index + 1 < blocks.length ? blocks[index + 1].start : source.length;
      const body = source.slice(start, end);

      const values = group.values[locale];
      if (!values) {
        console.error(`FAIL — no ${group.name} values for locale "${locale}"`);
        process.exitCode = 1;
        return;
      }

      const missing = Object.entries(values).filter(([key]) => !body.includes(`'${key}'`));
      if (missing.length === 0) continue;

      const anchorPattern = new RegExp(`^\\s*'${group.anchor.replace('.', '\\.')}':.*$`, 'm');
      const anchor = anchorPattern.exec(body);
      if (!anchor) {
        console.error(`FAIL — anchor "${group.anchor}" not found in locale "${locale}"`);
        process.exitCode = 1;
        return;
      }

      const offset = start + anchor.index + anchor[0].length;
      const lines = missing
        .map(([key, value]) => `\n  '${key}': '${String(value).replace(/'/g, "\\'")}',`)
        .join('');
      adjustments.push({ offset, text: lines });
      pending += missing.length;
    }

    console.log(`${group.name.padEnd(20)} ${pending} string(s) to insert`);
    totalPending += pending;
  }

  if (totalPending === 0) {
    console.log('');
    console.log('PASS — every string is already present in every locale.');
    return;
  }

  if (!WRITE) {
    console.log('');
    console.log('Run with --write to insert them.');
    return;
  }

  // Apply from the end so earlier offsets stay valid.
  adjustments.sort((a, b) => b.offset - a.offset);
  for (const { offset, text } of adjustments) {
    source = source.slice(0, offset) + text + source.slice(offset);
  }
  writeFileSync(I18N_PATH, source, 'utf8');
  console.log('');
  console.log(`wrote ${relative(ROOT, I18N_PATH)} (${totalPending} strings)`);
}

main();
