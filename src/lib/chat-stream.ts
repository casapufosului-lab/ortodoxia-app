/**
 * Streaming pentru chat (09.10.2026).
 *
 * DE CE: funcția Edge `orthodox-chat` nu mai așteaptă răspunsul complet al modelului; îl trimite bucată
 * cu bucată, ca server-sent events. `supabase.functions.invoke` citește TOT corpul înainte să întoarcă
 * ceva (deci ar anula exact câștigul), așa că aici se cheamă direct URL-ul funcției și se citește
 * `response.body` ca stream.
 *
 * CE GARANTEAZĂ MODULUL:
 * - fiecare bucată care sosește ajunge imediat la `onEvent`, deci textul se afișează pe măsură;
 * - timeout pe INACTIVITATE (dacă nu sosește nimic `idleTimeoutMs`), NU pe durata totală: un răspuns
 *   lung are voie să dureze, iar `totalTimeoutMs` rămâne doar plafon de siguranță;
 * - un stream întrerupt sau unul care se termină fără `done` iese cu `stream-error` și cu un cod pe care
 *   ecranul îl traduce — niciodată balon gol sau spinner veșnic;
 * - măsurători reale, nu estimate: `firstTextMs` (până la primul text) și `totalMs`.
 */

/** Cât acceptăm să tacă funcția înainte să considerăm streamul pierdut. */
export const CHAT_STREAM_IDLE_TIMEOUT_MS = 30_000;
/** Plafon de siguranță pentru o singură cerere, ca un stream blocat să nu țină ecranul ocupat la infinit. */
export const CHAT_STREAM_TOTAL_TIMEOUT_MS = 180_000;

export type ChatStreamMeta = {
  threadId: string | null;
  remaining: number;
  dailyLimit: number;
};

export type ChatStreamEvent =
  | { type: 'meta'; meta: ChatStreamMeta }
  | { type: 'delta'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

/**
 * Coduri de eșec, ca ecranul să aleagă textul tradus potrivit:
 * - `timeout`: nu a sosit nimic în fereastra de inactivitate (sau s-a atins plafonul total);
 * - `incomplete`: streamul s-a închis înainte de `done`;
 * - `network`: cererea nici nu a putut fi dusă la capăt;
 * - `server`: serverul a raportat singur un eșec (mesajul lui e în `message`, doar ca rezervă).
 */
export type ChatStreamFailure = 'timeout' | 'incomplete' | 'network' | 'server';

export type ChatStreamOutcome =
  | { kind: 'ok'; text: string; firstTextMs: number | null; totalMs: number }
  | { kind: 'http'; status: number; details: unknown }
  | { kind: 'stream-error'; failure: ChatStreamFailure; message: string; partialText: string };

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export type TimerHandle = ReturnType<typeof setTimeout>;
export type TimerApi = {
  schedule: (handler: () => void, milliseconds: number) => TimerHandle;
  cancel: (handle: TimerHandle) => void;
};

export const realTimers: TimerApi = {
  schedule: (handler, milliseconds) => setTimeout(handler, milliseconds),
  cancel: (handle) => clearTimeout(handle),
};

/** URL-ul funcției Edge, construit exact ca `functions.invoke` (care pune `functions/v1/<nume>`). */
export function chatFunctionUrl(projectUrl: string) {
  return `${projectUrl}/functions/v1/orthodox-chat`;
}

function textField(payload: unknown, key: string): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : null;
}

function numberField(payload: unknown, key: string): number | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Traduce cadrele SSE sosite într-un `chunk` în evenimente, păstrând în `carry` cadrul neterminat.
 *
 * Un cadru poate fi tăiat de rețea oriunde (chiar în mijlocul liniei `data:`), deci restul se lipește la
 * bucata următoare. Cadrele necunoscute sau neinteligibile se ignoră, exact ca un răspuns fără text.
 */
export function parseSseChunk(carry: string, chunk: string): { events: ChatStreamEvent[]; carry: string } {
  const events: ChatStreamEvent[] = [];
  let rest = carry + chunk.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (;;) {
    const separator = rest.indexOf('\n\n');
    if (separator === -1) return { events, carry: rest };
    const raw = rest.slice(0, separator);
    rest = rest.slice(separator + 2);

    let name = '';
    let data = '';
    for (const line of raw.split('\n')) {
      if (line.startsWith('event:')) name = line.slice('event:'.length).trim();
      else if (line.startsWith('data:')) data += line.slice('data:'.length).trim();
    }
    if (!data) continue;

    let payload: unknown;
    try {
      payload = JSON.parse(data);
    } catch {
      continue;
    }

    if (name === 'done') {
      events.push({ type: 'done' });
      continue;
    }
    if (name === 'error') {
      events.push({ type: 'error', message: textField(payload, 'message') ?? '' });
      continue;
    }
    if (name === 'meta') {
      const remaining = numberField(payload, 'remaining');
      const dailyLimit = numberField(payload, 'dailyLimit');
      const threadId = textField(payload, 'threadId');
      // Contoarele se folosesc doar dacă sunt coerente: altfel bara de cotă ar putea să mintă.
      if (remaining !== null && dailyLimit !== null) events.push({ type: 'meta', meta: { threadId, remaining, dailyLimit } });
      continue;
    }
    const delta = textField(payload, 'delta');
    if (delta) events.push({ type: 'delta', text: delta });
  }
}

/** Repornește cronometrul la fiecare semn de viață; `onTimeout` se apelează doar după o tăcere lungă. */
export function createInactivityGuard(timeoutMs: number, onTimeout: () => void, timers: TimerApi = realTimers) {
  let handle: TimerHandle | undefined;
  const stop = () => {
    if (handle !== undefined) {
      timers.cancel(handle);
      handle = undefined;
    }
  };
  return {
    bump: () => {
      stop();
      handle = timers.schedule(onTimeout, timeoutMs);
    },
    stop,
  };
}

export type StreamChatReplyArgs = {
  /** URL-ul proiectului Supabase (fără `/functions/v1`). */
  projectUrl: string;
  /** Cheia publică a proiectului: pleacă în `apikey` și, fără sesiune, și în `authorization`. */
  apiKey: string;
  /** Token de sesiune (cont sau oaspete), dacă există. Fără el, cererea e tratată ca vizitator fără cont. */
  accessToken?: () => Promise<string | null>;
  message: string;
  threadId: string | null;
  deviceId: string;
  onEvent: (event: ChatStreamEvent) => void;
  idleTimeoutMs?: number;
  totalTimeoutMs?: number;
  fetchImpl?: FetchLike;
  timers?: TimerApi;
  now?: () => number;
};

/**
 * Trimite mesajul și consumă răspunsul ca stream.
 *
 * Nu aruncă pentru eșecuri previzibile: întoarce mereu un `ChatStreamOutcome`, ca ecranul să poată
 * debloca butonul de trimitere și să scrie un mesaj clar.
 */
export async function streamChatReply(args: StreamChatReplyArgs): Promise<ChatStreamOutcome> {
  const fetchImpl = args.fetchImpl ?? ((url, init) => fetch(url, init));
  const timers = args.timers ?? realTimers;
  const now = args.now ?? (() => Date.now());
  const idleTimeoutMs = args.idleTimeoutMs ?? CHAT_STREAM_IDLE_TIMEOUT_MS;
  const totalTimeoutMs = args.totalTimeoutMs ?? CHAT_STREAM_TOTAL_TIMEOUT_MS;
  const startedAt = now();

  const controller = new AbortController();
  let timedOut = false;
  const guard = createInactivityGuard(idleTimeoutMs, () => {
    timedOut = true;
    controller.abort();
  }, timers);
  const totalHandle = timers.schedule(() => {
    timedOut = true;
    controller.abort();
  }, totalTimeoutMs);
  const cleanup = () => {
    guard.stop();
    timers.cancel(totalHandle);
  };

  let token = args.apiKey;
  try {
    token = (await args.accessToken?.()) ?? args.apiKey;
  } catch {
    // Fără sesiune se folosește cheia publică, exact ca `functions.invoke`.
  }

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    apikey: args.apiKey,
    authorization: `Bearer ${token}`,
    // Serverul aplică frâna pe un hash al acestui identificator + adresa clientului; valoarea nu e de
    // încredere pentru server, dar fără ea se aplică doar frâna pe IP.
    'x-device-id': args.deviceId,
  };

  let response: Response;
  try {
    guard.bump();
    response = await fetchImpl(chatFunctionUrl(args.projectUrl), {
      method: 'POST',
      signal: controller.signal,
      headers,
      body: JSON.stringify({ message: args.message, threadId: args.threadId }),
    });
  } catch {
    cleanup();
    return timedOut
      ? { kind: 'stream-error', failure: 'timeout', message: '', partialText: '' }
      : { kind: 'stream-error', failure: 'network', message: '', partialText: '' };
  }

  if (!response.ok) {
    cleanup();
    let details: unknown = null;
    try {
      details = await response.json();
    } catch {
      details = null;
    }
    return { kind: 'http', status: response.status, details };
  }

  const body = response.body;
  if (!body || typeof body.getReader !== 'function') {
    cleanup();
    return { kind: 'stream-error', failure: 'network', message: '', partialText: '' };
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let carry = '';
  let text = '';
  let firstTextMs: number | null = null;
  let sawDone = false;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      guard.bump();
      // `parseSseChunk` întoarce și evenimentele complete, și restul neterminat: ordinea
      // (meta → text → done) ajunge neschimbată la ecran, iar un cadru tăiat nu se pierde.
      const parsed = parseSseChunk(carry, decoder.decode(value, { stream: true }));
      carry = parsed.carry;
      for (const event of parsed.events) {
        if (event.type === 'delta') {
          text += event.text;
          if (firstTextMs === null) firstTextMs = now() - startedAt;
        }
        if (event.type === 'error') {
          // Şi ecranul primeşte evenimentul, apoi rezultatul spune de ce s-a oprit: astfel textul
          // parţial rămâne pe ecran, iar mesajul clar se scrie deasupra lui (cerinţa OB.2.3).
          args.onEvent(event);
          cleanup();
          void reader.cancel().catch(() => undefined);
          return { kind: 'stream-error', failure: 'server', message: event.message, partialText: text };
        }
        if (event.type === 'done') sawDone = true;
        args.onEvent(event);
      }
    }
  } catch {
    cleanup();
    void reader.cancel().catch(() => undefined);
    return timedOut
      ? { kind: 'stream-error', failure: 'timeout', message: '', partialText: text }
      : { kind: 'stream-error', failure: 'incomplete', message: '', partialText: text };
  }

  cleanup();
  if (!sawDone) return { kind: 'stream-error', failure: 'incomplete', message: '', partialText: text };
  return { kind: 'ok', text, firstTextMs, totalMs: now() - startedAt };
}

