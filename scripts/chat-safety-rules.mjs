#!/usr/bin/env node
/**
 * Poarta pentru regulile de siguranță ale asistentului AI.
 *
 * DE CE EXISTĂ
 * ------------
 * Regulile care țin asistentul în limitele lui (fără sfat medical, fără autovătămare tratată ca
 * subiect de conversație, fără citate inventate, cu trimitere la 112) trăiesc într-un singur
 * șir de caractere din `supabase/functions/orthodox-chat/index.ts`. Nimic nu le apăra: o
 * reformulare, o ștergere accidentală de linie sau o rescriere „mai scurtă" a promptului trecea
 * neobservată până când cineva întreba asistentul exact ce nu trebuia.
 *
 * Tot ce poate fi dovedit fără rețea e dovedit aici:
 *
 *   1. promptul livrat conține FIECARE regulă obligatorie (textul e citit din funcția Edge, nu
 *      dintr-o copie, deci verificarea nu se poate desincroniza de la cod);
 *   2. fiecare verificare este SENSIBILĂ: dacă regula dispare din prompt, poarta cade. Asta se
 *      demonstrează în memorie, pe copii modificate ale promptului, la fiecare rulare — nu se
 *      pretinde, se arată;
 *   3. cererea către OpenAI chiar trimite promptul (`instructions: systemInstructions`), plus
 *      `safety_identifier` și `store: false`;
 *   4. calea de raportare există cap-coadă: butonul din chat, tabelul `ai_reports` din migrație
 *      (cu RLS și politici doar pe rândurile proprii) și procesul de moderare din `docs/`.
 *
 * CE NU POATE DOVEDI
 * ------------------
 * Dacă modelul respectă regulile. Un prompt complet și o poartă verde sunt condiții necesare, nu
 * suficiente: verificarea de comportament se face pe emulator, cu întrebări reale.
 *
 * Utilizare:
 *   node scripts/chat-safety-rules.mjs --self-test   (folosit de `npm run safety`)
 *   node scripts/chat-safety-rules.mjs               (aceeași verificare, format scurt)
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

export const CHAT_FUNCTION = join(ROOT, 'supabase', 'functions', 'orthodox-chat', 'index.ts');
export const CHAT_SCREEN = join(ROOT, 'src', 'app', '(tabs)', 'chat.tsx');
export const REPORTS_MIGRATION = join(
  ROOT,
  'supabase',
  'migrations',
  '20261008000200_add_ai_reports.sql',
);
export const MODERATION_DOC = join(ROOT, 'docs', 'MODERARE-CONTINUT-AI.md');

/**
 * Regulile obligatorii din prompt.
 *
 * `pattern` e o expresie care trebuie să apară în promptul livrat. Verificările sunt intenționat
 * legate de formularea de acum: cine vrea să reformuleze o regulă trebuie să treacă prin acest
 * fișier și să confirme că regula a rămas, ceea ce este exact scopul porții.
 */
export const REQUIRED_RULES = [
  {
    id: 'nu-te-da-drept-preot',
    pattern: /Nu te prezenta drept preot/,
    why: 'aplicația promite în magazin și în politică că nu înlocuiește preotul',
  },
  {
    id: 'ramane-la-subiect',
    pattern: /Rămâi la întrebările despre/,
    why: 'fără asta asistentul răspunde la orice, iar magazinul descrie o aplicație religioasă',
  },
  {
    id: 'fara-citate-inventate',
    pattern: /Nu inventa citate biblice/,
    why: 'un citat biblic inventat este cea mai gravă eroare posibilă într-o aplicație religioasă',
  },
  {
    id: 'fara-sfat-medical',
    pattern: /Nu oferi sfaturi medicale/,
    why: 'B5: un diagnostic sau o doză dată de un asistent AI poate răni; AGENTS.md regula 36',
  },
  {
    id: 'autovatamare-catre-112',
    pattern: /autovătămare[\s\S]*?112|112[\s\S]*?autovătămare/,
    why: 'B5: cine vorbește despre sinucidere trebuie trimis imediat la 112, nu ținut în conversație',
  },
  {
    id: 'fara-sfat-juridic-financiar',
    pattern: /Nu oferi sfaturi juridice/,
    why: 'sfatul juridic/financiar e în afara domeniului și are consecințe reale',
  },
  {
    id: 'refuza-continut-periculos',
    pattern: /conținut de ură/,
    why: 'politica Play pentru conținut generat de AI cere refuzul conținutului de ură/periculos',
  },
];

/** Extrage promptul livrat din funcția Edge (sau `null` dacă șirul nu mai există). */
export function extractPrompt(source) {
  const match = source.match(/const systemInstructions = `([\s\S]*?)`;/);
  return match ? match[1] : null;
}

/** Regulile care lipsesc dintr-un text de prompt. */
export function missingRules(promptText) {
  if (typeof promptText !== 'string') return REQUIRED_RULES.map((rule) => rule.id);
  return REQUIRED_RULES.filter((rule) => !rule.pattern.test(promptText)).map((rule) => rule.id);
}

/**
 * Verifică cererea către OpenAI: promptul chiar e trimis, iar identificatorul de siguranță și
 * `store: false` sunt pe locul lor (fără ele, OpenAI nu poate raporta abuzuri, respectiv
 * păstrează conținutul — ambele contrazic politica de confidențialitate publicată).
 */
export function deliveryProblems(source) {
  const problems = [];
  if (!/instructions:\s*systemInstructions/.test(source)) {
    problems.push('promptul nu este trimis către OpenAI (`instructions: systemInstructions` lipsește)');
  }
  if (!/safety_identifier:\s*user\.id/.test(source)) {
    problems.push('`safety_identifier` lipsește din cerere');
  }
  if (!/store:\s*false/.test(source)) {
    problems.push('`store: false` lipsește din cerere');
  }
  if (!/max_output_tokens:\s*\d+/.test(source)) {
    problems.push('`max_output_tokens` lipsește din cerere (un răspuns fără limită poate costa oricât)');
  }
  return problems;
}

/** Verifică lanțul de raportare: butonul din chat, tabelul din migrație, procesul documentat. */
export function reportPathProblems({ chatScreen, migration, moderationDoc }) {
  const problems = [];

  if (typeof chatScreen !== 'string') {
    problems.push('ecranul de chat lipsește');
  } else {
    if (!/from\('ai_reports'\)/.test(chatScreen)) {
      problems.push('ecranul de chat nu menționează `ai_reports`');
    } else if (!/from\('ai_reports'\)[\s\S]{0,60}?\.insert\(/.test(chatScreen)) {
      problems.push('ecranul de chat nu scrie în `ai_reports`');
    }
    if (!/message\.role === 'assistant'/.test(chatScreen)) {
      problems.push('butonul de raportare nu este limitat la răspunsurile asistentului');
    }
    if (!/chat\.reportFailed/.test(chatScreen)) {
      problems.push('eșecul raportării nu este spus utilizatorului (ar fi o pierdere tăcută)');
    }
    if (!/from 'react-native'/.test(chatScreen) || !/\bAlert\b/.test(chatScreen)) {
      problems.push('ecranul de chat nu are dialogul de confirmare (`Alert`)');
    }
  }

  if (typeof migration !== 'string') {
    problems.push('migrația `20261008000200_add_ai_reports.sql` lipsește');
  } else {
    if (!/create table if not exists public\.ai_reports/i.test(migration)) {
      problems.push('migrația nu creează tabelul `ai_reports`');
    }
    if (!/enable row level security/i.test(migration)) {
      problems.push('tabelul `ai_reports` nu are RLS activat');
    }
    if (!/user_id uuid not null default auth\.uid\(\)/i.test(migration)) {
      problems.push('`user_id` nu are `default auth.uid()` — clientul ar putea scrie în numele altcuiva');
    }
    if (!/for insert\s+to authenticated\s+with check \(\(select auth\.uid\(\)\) = user_id\)/i.test(migration)) {
      problems.push('lipsește politica de inserare doar pe rândurile proprii');
    }
    if (!/revoke all on public\.ai_reports from anon/i.test(migration)) {
      problems.push('drepturile pentru `anon` nu au fost retrase');
    }
    if (/for update|for delete/i.test(migration)) {
      problems.push('există politici de update/delete: un raport trimis ar putea fi modificat sau șters');
    }
  }

  if (typeof moderationDoc !== 'string') {
    problems.push('procesul de moderare nu este documentat (`docs/MODERARE-CONTINUT-AI.md`)');
  } else {
    if (!/ai_reports/.test(moderationDoc)) problems.push('documentul de moderare nu spune unde ajung raportările');
    if (!/status/i.test(moderationDoc) || !/open/.test(moderationDoc)) {
      problems.push('documentul de moderare nu descrie stările unui raport');
    }
  }

  return problems;
}

function readIfExists(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

function loadAll() {
  return {
    source: readIfExists(CHAT_FUNCTION),
    chatScreen: readIfExists(CHAT_SCREEN),
    migration: readIfExists(REPORTS_MIGRATION),
    moderationDoc: readIfExists(MODERATION_DOC),
  };
}

/** Rulează verificarea completă pe fișierele reale; întoarce lista problemelor. */
export function analyse(files = loadAll()) {
  const problems = [];
  if (typeof files.source !== 'string') {
    problems.push('funcția Edge `orthodox-chat` lipsește');
    return problems;
  }

  const prompt = extractPrompt(files.source);
  if (prompt === null) {
    problems.push('promptul nu mai există în `orthodox-chat/index.ts` (șirul `systemInstructions`)');
    return problems;
  }

  for (const id of missingRules(prompt)) {
    const rule = REQUIRED_RULES.find((candidate) => candidate.id === id);
    problems.push(`regula „${id}" lipsește din prompt (${rule?.why ?? 'fără motiv notat'})`);
  }

  problems.push(...deliveryProblems(files.source));
  problems.push(...reportPathProblems(files));
  return problems;
}

/** Scoate din prompt linia care conține regula dată (folosit de auto-test). */
export function withoutRule(promptText, rule) {
  const marker = rule.pattern.source
    .split(/\[\\s\\S\]\*\?|\|/)[0]
    .replace(/\\/g, '');
  const kept = promptText.split('\n').filter((line) => !line.includes(marker));
  return kept.join('\n');
}

function report(lines, checker, label) {
  const problems = checker();
  if (problems.length === 0) {
    lines.push(`PASS  ${label}`);
  } else {
    lines.push(`FAIL  ${label}`);
    for (const problem of problems) lines.push(`      - ${problem}`);
  }
  return problems.length === 0;
}

export function selfTest(files = loadAll()) {
  const lines = [];
  let ok = true;
  const prompt = typeof files.source === 'string' ? extractPrompt(files.source) : null;

  ok = report(lines, () => analyse(files), `prompt, cerere și cale de raportare (${REQUIRED_RULES.length} reguli)`) && ok;

  // Sensibilitatea fiecărei reguli: dispariția ei trebuie să fie raportată.
  if (prompt === null) {
    lines.push('FAIL  nu pot testa sensibilitatea: promptul nu a fost găsit');
    return { lines, ok: false };
  }
  for (const rule of REQUIRED_RULES) {
    const mutated = withoutRule(prompt, rule);
    ok = report(
      lines,
      () => {
        const missing = missingRules(mutated);
        if (missing.includes(rule.id)) return [];
        return [`regula „${rule.id}" a fost scoasă din prompt, dar poarta nu a observat`];
      },
      `sensibilitate: fără regula „${rule.id}" verificarea cade`,
    ) && ok;
  }

  // Și reciproca: o regulă scoasă NU trebuie raportată dacă e prezentă (fără falsuri pozitive).
  ok = report(
    lines,
    () => (missingRules(prompt).length === 0 ? [] : [`fals pozitiv: ${missingRules(prompt).join(', ')}`]),
    'sensibilitate: promptul real nu produce niciun fals pozitiv',
  ) && ok;

  return { lines, ok };
}

const argv = process.argv.slice(2);

// Rulează doar când fișierul este chiar cel pornit din linia de comandă: testele importă
// funcțiile de mai sus, iar un import care tipărește și iese din proces ar ruina suita.
const invokedDirectly =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (invokedDirectly) {
  if (argv.includes('--self-test')) {
    const { lines, ok } = selfTest();
    for (const line of lines) console.log(line);
    process.exit(ok ? 0 : 1);
  } else {
    const problems = analyse();
    if (problems.length === 0) {
      console.log(
        `regulile de siguranță ale asistentului: ${REQUIRED_RULES.length} reguli prezente, ` +
          'cererea către OpenAI completă, calea de raportare completă',
      );
    } else {
      for (const problem of problems) console.log(`FAIL  ${problem}`);
      process.exit(1);
    }
  }
}
