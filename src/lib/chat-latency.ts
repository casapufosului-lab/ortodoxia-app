/**
 * OB.1 — măsurători de latență scrise în logul aplicației (logcat), ca cifre reale, nu impresii.
 *
 * DE CE UN MODUL SEPARAT: garda din `tests/chat-send-guards.test.mjs` interzice `console.log` în
 * corpul lui `send` (regula „fără logare de dezvoltare a conținutului AI"). Aici se scriu DOAR
 * durate și starea cererii — niciodată textul mesajului ori al răspunsului. Formatul liniei e
 * stabil, ca testerul (ori ownerul, citind logcat) să-l poată căuta cu un singur șir:
 *
 *   [chat-latency] primul text 1840 ms
 *   [chat-latency] total 7420 ms (primul text 1840 ms)
 *   [chat-latency] eșec HTTP 210 ms (status 429)
 */

/**
 * Treptele scrise în log. Fiecare apăsare pe „Trimite" lasă cel puțin o linie: `cererea a plecat`
 * (cererea chiar a ieșit pe rețea) sau `cerere oprită` (aplicația a refuzat-o înainte de plecare,
 * cu motivul în paranteză). Prima variantă fără a doua înseamnă că un ecran fără răspuns nu spune
 * dacă a picat rețeaua ori dacă aplicația a oprit cererea înainte s-o trimită — exact cazul
 * măsurat pe 13.10.2026 (chat 0/3 pe iOS, cu cotă curată „5 din 5", fără nicio linie în log).
 */
export type ChatLatencyStage =
  | 'cererea a plecat'
  | 'pregatire'
  | 'primul text'
  | 'total'
  | 'eșec HTTP'
  | 'stream întrerupt'
  | 'excepție'
  | 'cerere oprită'
  | 'încărcare eșuată';

export const CHAT_LATENCY_PREFIX = '[chat-latency]';

/**
 * Numele fișierului în care se scriu aceleași linii, în containerul de date al aplicației
 * (iOS: `<container>/Documents/chat-latency.log`; Android: `/data/data/<pachet>/files/`).
 *
 * DE CE ȘI FIȘIER, NU DOAR LOGUL SISTEMULUI (măsurat 13.10.2026): în build-ul de RELEASE logul
 * sistemului nu a arătat nicio linie `[chat-latency]` (app-log.txt din artefactul rulării iOS
 * 38367884698: 0 apariții). Fișierul din container este citit direct de CI (`simctl
 * get_app_container` pe iOS, `adb root` + `cat` pe Android) și nu depinde de ce colectează
 * logul sistemului. Liniile sunt IDENTICE în ambele canale, deci aceeași dovadă se poate căuta
 * cu un singur șir.
 */
export const CHAT_LATENCY_FILE = 'chat-latency.log';

/** Linia de log, construită separat de scriere: așa poate fi testată fără să citească nimeni logcatul. */
export function chatLatencyLine(stage: ChatLatencyStage, milliseconds: number, detail?: string): string {
  const base = `${CHAT_LATENCY_PREFIX} ${stage} ${Math.round(milliseconds)} ms`;
  return detail === undefined ? base : `${base} (${detail})`;
}

/** Modulul nativ, cerut leneș: în testele Node `require('expo-file-system')` nu poate fi încărcat. */
type ScriitorInFisier = { scrie: (linie: string) => void };

let scriitor: ScriitorInFisier | null | undefined;

/**
 * Deschide (o singură dată) fișierul de dovadă. Orice eroare aici este ÎNCHISĂ: instrumentul de
 * observabilitate nu are voie să schimbe comportamentul aplicației. În testele Node (unde modulul
 * nativ nu există) întoarce `null`, iar linia rămâne doar pe `console.warn`.
 */
function pregatesteScriitorul(): ScriitorInFisier | null {
  if (scriitor !== undefined) return scriitor;
  scriitor = null;
  try {
    const modul = require('expo-file-system') as {
      File: new (...parti: unknown[]) => {
        exists: boolean;
        create: (options?: { intermediates?: boolean; overwrite?: boolean }) => void;
        write: (continut: string, options?: { append?: boolean }) => void;
      };
      Paths: { document: unknown };
    };
    const fisier = new modul.File(modul.Paths.document, CHAT_LATENCY_FILE);
    if (!fisier.exists) fisier.create({ intermediates: true });
    scriitor = { scrie: (linie) => fisier.write(linie, { append: true }) };
  } catch {
    scriitor = null;
  }
  return scriitor;
}

/** Scrie linia în logul aplicației ȘI în fișierul de dovadă. Conținutul conversației nu are ce căuta aici. */
export function logChatLatency(stage: ChatLatencyStage, milliseconds: number, detail?: string): void {
  // DE CE `console.warn`, NU `console.log` (masurat 13.10.2026, rularea iOS 38367884698): in build-ul
  // de RELEASE `console.log` NU ajunge in logul sistemului — in `app-log.txt` din artefact (17 896 de
  // linii ale procesului aplicatiei) marcajul `[chat-latency]` aparea de 0 ori, desi instrumentul era
  // apelat. Canalul de avertismente (RCTLog -> os_log pe iOS, logcat `ReactNativeJS` pe Android) este
  // colectat de CI. Formatul liniei ramane neschimbat, iar aici se scriu DOAR durate si stari.
  const linie = chatLatencyLine(stage, milliseconds, detail);
  console.warn(linie);
  try {
    pregatesteScriitorul()?.scrie(`${linie}\n`);
  } catch {
    // Dovada din fisier e un plus: daca scrierea cade, linia a plecat deja pe console.warn.
  }
}
