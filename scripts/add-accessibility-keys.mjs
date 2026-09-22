#!/usr/bin/env node
/**
 * Insert the accessibility copy added by the accessibility pass into all 10 locales.
 *
 * WHY A SCRIPT
 * ------------
 * src/i18n/config.ts holds ten near-identical locale blocks in one 5.2k-line file.
 * Hand-editing it invites exactly the failure the i18n validator exists to catch:
 * one locale left without the key, so `t()` returns the key's own name on a
 * Greek or Georgian device. The existing `insertKeysAfterAnchor` helper in
 * scripts/validate-i18n-corpus.mjs solves the same problem, and this script reuses
 * that approach rather than inventing a second one.
 *
 * Usage:
 *   node scripts/add-accessibility-keys.mjs           # check + insert
 *   node scripts/add-accessibility-keys.mjs --check   # report only, never write
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const I18N_PATH = join(ROOT, 'src', 'i18n', 'config.ts');
const CHECK_ONLY = process.argv.includes('--check');

const LOCALES = ['ro', 'en', 'el', 'sr', 'bg', 'mk', 'uk', 'ka', 'ru', 'sq'];

/**
 * The hero line was a Romanian literal in the Home screen, so nine locales showed
 * Romanian and no screen reader could ever announce it in the user's language.
 */
const HERO_TITLE = {
  ro: 'Doamne, luminează-mi calea',
  en: 'Lord, light my way',
  el: 'Κύριε, φώτισέ μου τον δρόμο',
  sr: 'Господе, просвети мој пут',
  bg: 'Господи, озари пътя ми',
  mk: 'Господи, просветли го мојот пат',
  uk: 'Господи, просвіти мій шлях',
  ka: 'უფალო, ნათელ მყავს გზა',
  ru: 'Господи, просвети путь мой',
  sq: 'Zot, ndriçoje rrugën time',
};

/** Dictation stopped on its own (aborted / no speech / timeout). */
const DICTATION_STOPPED = {
  ro: 'Dictarea s-a oprit fără text nou.',
  en: 'Dictation stopped without new text.',
  el: 'Η υπαγόρευση σταμάτησε χωρίς νέο κείμενο.',
  sr: 'Диктат је заустављен без новог текста.',
  bg: 'Диктовката спря без нов текст.',
  mk: 'Диктатот запре без нов текст.',
  uk: 'Диктування зупинилося без нового тексту.',
  ka: 'ნაკარნახევი შეწყდა ახალი ტექსტის გარეშე.',
  ru: 'Диктовка остановилась без нового текста.',
  sq: 'Diktimi u ndal pa tekst të ri.',
};

/** The microphone permission was refused, so dictation cannot start at all. */
const DICTATION_BLOCKED = {
  ro: 'Activează microfonul din setări pentru a folosi dictarea.',
  en: 'Turn on the microphone in Settings to use dictation.',
  el: 'Ενεργοποίησε το μικρόφωνο στις Ρυθμίσεις για να χρησιμοποιήσεις την υπαγόρευση.',
  sr: 'Укључи микрофон у подешавањима да би користио диктат.',
  bg: 'Включи микрофона от настройките, за да използваш диктовка.',
  mk: 'Вклучи го микрофонот во поставките за да го користиш диктатот.',
  uk: 'Увімкніть мікрофон у налаштуваннях, щоб користуватися диктуванням.',
  ka: 'ჩართე მიკროფონი პარამეტრებში ნაკარნახის გამოსაყენებლად.',
  ru: 'Включи микрофон в настройках, чтобы пользоваться диктовкой.',
  sq: 'Aktivizo mikrofonin në cilësimet për të përdorur diktimin.',
};

/** Any other dictation failure. */
const DICTATION_FAILED = {
  ro: 'Dictarea nu a putut porni. Încearcă din nou.',
  en: 'Dictation could not start. Try again.',
  el: 'Η υπαγόρευση δεν μπόρεσε να ξεκινήσει. Δοκίμασε ξανά.',
  sr: 'Диктат није могао да почне. Покушај поново.',
  bg: 'Диктовката не можа да започне. Опитай отново.',
  mk: 'Диктатот не можеше да започне. Обиди се повторно.',
  uk: 'Диктування не вдалося запустити. Спробуйте ще раз.',
  ka: 'ნაკარნახი ვერ დაიწყო. სცადე ხელახლა.',
  ru: 'Диктовка не смогла запуститься. Попробуй ещё раз.',
  sq: 'Diktimi nuk mundi të nisë. Provo përsëri.',
};

const INSERTIONS = [
  { anchor: "'home.liveAccessibilityLabel':", values: { 'home.heroTitle': HERO_TITLE } },
  {
    anchor: "'chat.dictationAdded':",
    values: {
      'chat.dictationStoppedNoText': DICTATION_STOPPED,
      'chat.dictationMicrophoneBlocked': DICTATION_BLOCKED,
      'chat.dictationStartFailed': DICTATION_FAILED,
    },
  },
];

function parseLocaleBlocks(source) {
  const blocks = new Map();
  const matches = [...source.matchAll(/^const (ro|en|el|sr|bg|mk|uk|ka|ru|sq) = \{$/gm)];
  for (let i = 0; i < matches.length; i += 1) {
    const locale = matches[i][1];
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : source.length;
    blocks.set(locale, { start, end, body: source.slice(start, end) });
  }
  return blocks;
}

function main() {
  const original = readFileSync(I18N_PATH, 'utf8');
  const blocks = parseLocaleBlocks(original);
  if (blocks.size !== LOCALES.length) {
    console.error(`Expected ${LOCALES.length} locale blocks, found ${blocks.size}. Refusing to write.`);
    process.exitCode = 1;
    return;
  }

  const edits = [];
  let inserted = 0;
  let missingAnchor = 0;

  for (const { anchor, values } of INSERTIONS) {
    for (const locale of LOCALES) {
      const block = blocks.get(locale);
      const pending = Object.entries(values).filter(([key, byLocale]) => (
        byLocale[locale] !== undefined && !block.body.includes(`'${key}'`)
      ));
      if (pending.length === 0) continue;

      const anchorPattern = new RegExp(`^\\s*${anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*$`, 'm');
      const anchorMatch = anchorPattern.exec(block.body);
      if (!anchorMatch) {
        console.error(`  ! ${locale}: anchor ${anchor} not found`);
        missingAnchor += 1;
        continue;
      }

      const offset = block.start + anchorMatch.index + anchorMatch[0].length;
      const lines = pending
        .map(([key, byLocale]) => `\n  '${key}': '${String(byLocale[locale]).replace(/'/g, "\\'")}',`)
        .join('');
      edits.push({ offset, text: lines });
      inserted += pending.length;
    }
  }

  console.log(`accessibility keys: ${inserted} insertion(s) across ${LOCALES.length} locales`);
  if (missingAnchor > 0) {
    console.error(`${missingAnchor} anchor(s) missing — nothing written.`);
    process.exitCode = 1;
    return;
  }
  if (inserted === 0) {
    console.log('Nothing to insert; every locale already carries the keys.');
    return;
  }
  if (CHECK_ONLY) {
    console.log('--check: no file written.');
    process.exitCode = 1;
    return;
  }

  edits.sort((a, b) => b.offset - a.offset);
  let output = original;
  for (const { offset, text } of edits) {
    output = output.slice(0, offset) + text + output.slice(offset);
  }
  writeFileSync(I18N_PATH, output);

  const after = readFileSync(I18N_PATH, 'utf8');
  const afterBlocks = parseLocaleBlocks(after);
  const problems = [];
  for (const { values } of INSERTIONS) {
    for (const key of Object.keys(values)) {
      for (const locale of LOCALES) {
        if (!afterBlocks.get(locale).body.includes(`'${key}'`)) problems.push(`${locale}:${key}`);
      }
    }
  }
  if (problems.length > 0) {
    console.error(`Post-write verification failed: ${problems.join(', ')}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Wrote ${I18N_PATH} and verified every key in every locale.`);
}

main();
