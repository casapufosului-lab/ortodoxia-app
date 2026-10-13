/**
 * OB.1 — măsurători de latenţă scrise în logul aplicaţiei (logcat), ca cifre reale, nu impresii.
 *
 * DE CE UN MODUL SEPARAT: garda din `tests/chat-send-guards.test.mjs` interzice `console.log` în
 * corpul lui `send` (regula „fără logare de dezvoltare a conţinutului AI"). Aici se scriu DOAR
 * durate şi starea cererii — niciodată textul mesajului ori al răspunsului. Formatul liniei e
 * stabil, ca testerul (ori ownerul, citind logcat) să-l poată căuta cu un singur şir:
 *
 *   [chat-latency] primul text 1840 ms
 *   [chat-latency] total 7420 ms (primul text 1840 ms)
 *   [chat-latency] eșec HTTP 210 ms (status 429)
 */

/**
 * Treptele scrise în log. Fiecare apăsare pe „Trimite” lasă cel puțin o linie: `cererea a plecat`
 * (cererea chiar a ieșit pe rețea) sau `cerere oprită` (aplicația a refuzat-o înainte de plecare,
 * cu motivul în paranteză). Prima variantă fără a doua însemna că un ecran fără răspuns nu spune
 * dacă a picat rețeaua ori dacă aplicația a oprit cererea înainte s-o trimită — exact cazul
 * măsurat pe 13.10.2026 (chat 0/3 pe iOS, cu cotă curată „5 din 5”, fără nicio linie în log).
 */
export type ChatLatencyStage =
  | 'cererea a plecat'
  | 'primul text'
  | 'total'
  | 'eșec HTTP'
  | 'stream întrerupt'
  | 'excepție'
  | 'cerere oprită'
  | 'încărcare eșuată';

export const CHAT_LATENCY_PREFIX = '[chat-latency]';

/** Linia de log, construită separat de scriere: aşa poate fi testată fără să citească nimeni logcatul. */
export function chatLatencyLine(stage: ChatLatencyStage, milliseconds: number, detail?: string): string {
  const base = `${CHAT_LATENCY_PREFIX} ${stage} ${Math.round(milliseconds)} ms`;
  return detail === undefined ? base : `${base} (${detail})`;
}

/** Scrie linia în logul aplicaţiei. Conţinutul conversaţiei nu are ce căuta aici. */
export function logChatLatency(stage: ChatLatencyStage, milliseconds: number, detail?: string): void {
  console.log(chatLatencyLine(stage, milliseconds, detail));
}
