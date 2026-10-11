import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, createJsonResponder, preflightResponse } from '../_shared/http.ts';
import {
    AI_CHAIN,
    authHeaders,
    extractDelta,
    extractText,
    frameFailed,
    hasUsableStep,
    pickStep,
    preferredRemainingHeader,
    requestUrl,
    type ChainStep,
} from '../_shared/ai-chain.ts';
import { buildLimitIdentity, normalizeAddress, normalizeDevice } from './limit-identity.ts';

const ALLOWED_HEADERS = 'authorization, x-client-info, apikey, content-type';

const FREE_DAILY_AI_LIMIT = 5;
const PREMIUM_DAILY_AI_LIMIT = 50;
/**
 * Free-tier brake enforced in SQL against a salted hash of (device header + client IP).
 *
 * It exists because an account is free to create: the per-identity daily limit bounds one
 * account, not one person. The SQL constants are the source of truth and are checked here so
 * a deployment where the two drifted fails closed instead of silently serving free messages.
 * A second, IP-only brake lives in SQL as well; it is not echoed back to this function.
 */
const CLIENT_DAILY_LIMIT = 20;
/** Longest accepted `retry_after_seconds` for a monthly denial (31 days). */
const MAX_MONTHLY_RETRY_SECONDS = 2_678_400;
const DENIAL_REASONS = ['cooldown', 'daily_limit', 'client_limit', 'ip_limit', 'monthly_cap'] as const;
type DenialReason = (typeof DENIAL_REASONS)[number];
type Reservation = {
    success: boolean;
    remaining_limit: number;
    daily_limit: number;
    denial_reason: DenialReason | null;
    retry_after_seconds: number;
    client_limit: number;
    monthly_remaining: number;
};

/** Hash of a bounded client signal, salted with a server-only secret. */
async function sha256Hex(value: string) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * The client address as the platform reports it.
 *
 * The raw value never leaves this process: only its salted hash reaches SQL. `null` means the
 * platform reported nothing usable; the caller must then fall back to the device signal instead of
 * a literal 'unknown' (a shared counter for every caller — see `./limit-identity.ts`, C13).
 */
function clientAddress(req: Request) {
    return normalizeAddress([
        req.headers.get('cf-connecting-ip'),
        req.headers.get('x-real-ip'),
        req.headers.get('x-forwarded-for'),
    ]);
}

/** The app-supplied device identifier, accepted only in a bounded, known-safe shape. */
function deviceSignal(req: Request) {
    return normalizeDevice(req.headers.get('x-device-id'));
}
const systemInstructions = `Ești un ghid informativ în limba română pentru o aplicație despre credința ortodoxă.
Răspunde clar, cald și concis. Rămâi la întrebările despre rugăciune, calendar, sfinți, termeni și viață duhovnicească ortodoxă.
Nu te prezenta drept preot și nu înlocui sfatul duhovnicului. Pentru decizii personale importante, îndrumă utilizatorul către preotul său.
Nu inventa citate biblice, canoane, sărbători sau poziții oficiale. Dacă nu ești sigur, spune direct că informația trebuie verificată într-o sursă bisericească.
Pentru urgențe medicale sau pericol imediat, recomandă serviciile de urgență și ajutorul unui profesionist.
Nu oferi sfaturi medicale: nu pune diagnostice, nu recomanda tratamente, doze sau medicamente și nu interpreta analize, simptome ori rețete. Îndrumă persoana la medicul ei sau la serviciile medicale.
Dacă cineva vorbește despre autovătămare, sinucidere sau pericol imediat pentru sine ori pentru altcineva, răspunde scurt și empatic, fără să moralizezi și fără să ceri amănunte despre metode, și îndrumă imediat la 112 (numărul european de urgență), apoi la o persoană de încredere sau la un serviciu de sănătate mintală. Nu propune metode, nu descrie tehnici și nu da cifre despre doze.
Nu oferi sfaturi juridice sau financiare și nu ajuta la luarea unei decizii care poate răni pe cineva.
Refuză politicos cererile care ar produce conținut de ură, hărțuire, sexual, ilegal sau periculos și adu discuția înapoi la subiectele aplicației.`;
type RequestBody = {
    message?: unknown;
    threadId?: unknown;
    guestId?: unknown;
};
/**
 * Streaming: model → funcție → aplicație (09.10.2026).
 *
 * Până acum funcția aștepta răspunsul COMPLET al modelului (`await response.json()`) și abia apoi
 * trimitea ceva aplicației, care afișa tot textul deodată: testerul vedea 5–15 s de spinner, deși
 * modelul începe să scrie în ~1 s. Acum funcția cere modelului `stream: true` și trimite fiecare
 * bucată mai departe ca server-sent events, iar aplicația o afișează pe măsură ce sosește.
 *
 * Ce NU se schimbă: rezervarea cotei rămâne ÎNAINTE de apelul AI (`reserve_ai_request`, mai jos), iar
 * mesajul asistentului se scrie în istoric la FINALUL streamului, nu în timpul lui.
 *
 * C17: `json` se construiește în handler, legat de cererea curentă (`createJsonResponder` din
 * `../_shared/http.ts`). Nu mai există nicio stare la nivel de modul, deci o cerere concurentă nu
 * poate împrumuta `Origin`-ul alteia.
 */
type ModelFrame = {
    event: string;
    data: unknown;
};
/** Cât acceptăm să tacă modelul între două bucăți: inactivitatea taie streamul, nu durata totală. */
const AI_IDLE_TIMEOUT_MS = positiveInteger(Deno.env.get('AI_IDLE_TIMEOUT_MS')) ?? 20000;
/** Plafon de siguranță pentru un singur răspuns, ca un stream blocat să nu țină conexiunea la infinit. */
const AI_TOTAL_TIMEOUT_MS = positiveInteger(Deno.env.get('AI_TOTAL_TIMEOUT_MS')) ?? 120000;
/** Mesaj unic pentru orice eșec al serviciului AI: nu dezvăluie detalii de furnizor. */
const AI_UNAVAILABLE_MESSAGE = 'Serviciul AI nu a răspuns. Încearcă din nou mai târziu.';
const SSE_RESPONSE_HEADERS: Record<string, string> = {
    'Content-Type': 'text/event-stream',
    // Fără caching și fără transformare: un buffer intermediar ar anula exact câștigul de latență.
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
};
/**
 * Cele două praguri se pot scurta prin variabile de mediu DOAR pentru teste și rulări locale, ca un
 * test să nu aștepte 20 de secunde. În producție variabilele nu sunt setate, deci valorile implicite
 * rămân cele de mai sus.
 */
function positiveInteger(raw: string | undefined) {
    if (typeof raw !== 'string' || raw.trim() === '')
        return null;
    const value = Number(raw);
    return Number.isInteger(value) && value > 0 ? value : null;
}
/** Un cadru SSE către aplicație: `event:` (opțional) + `data:` + linie goală. */
function sseFrame(event: string | null, payload: Record<string, unknown>) {
    const data = `data: ${JSON.stringify(payload)}\n\n`;
    return event === null ? data : `event: ${event}\n${data}`;
}
/**
 * Citește cadrele complete dintr-un buffer SSE și păstrează restul pentru bucata următoare.
 *
 * Un cadru poate fi tăiat de rețea în orice punct (chiar în mijlocul liniei `data:`), deci restul
 * neîntregit NU se aruncă: se lipește la bucata următoare.
 */
function takeFrames(carry: string) {
    const frames: ModelFrame[] = [];
    let rest = carry;
    for (;;) {
        const separator = rest.indexOf('\n\n');
        if (separator === -1)
            return { frames, rest };
        const raw = rest.slice(0, separator);
        rest = rest.slice(separator + 2);
        let event = '';
        let data = '';
        for (const line of raw.split('\n')) {
            if (line.startsWith('event:'))
                event = line.slice('event:'.length).trim();
            else if (line.startsWith('data:'))
                data += line.slice('data:'.length).trim();
        }
        if (data === '[DONE]') {
            frames.push({ event: 'done', data: null });
            continue;
        }
        if (!data)
            continue;
        try {
            frames.push({ event, data: JSON.parse(data) as unknown });
        }
        catch {
            // Cadru neinteligibil: îl ignorăm, exact ca un răspuns fără text.
        }
    }
}
Deno.serve(async (req: Request) => {
  // C17: responderul e legat de această cerere, nu de o variabilă de modul.
  const json = createJsonResponder(req, ALLOWED_HEADERS);
    if (req.method === 'OPTIONS')
        return preflightResponse(req, ALLOWED_HEADERS);
    if (req.method !== 'POST')
        return json({ error: 'Metodă neacceptată.' }, 405);
    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        // Cascada (§3.1): pasul OpenAI stă stins cât timp contul n-are credit; se aprinde din mediu,
        // fără nicio modificare de cod (AI_CHAIN_ENABLE_OPENAI=true), ca ownerul să-l poată pune primul.
        const enableOpenAI = (Deno.env.get('AI_CHAIN_ENABLE_OPENAI') ?? '').trim().toLowerCase() === 'true';
        const providerKeys: Record<string, string | undefined> = {
            OPENAI_API_KEY: Deno.env.get('OPENAI_API_KEY'),
            GROQ_API_KEY: Deno.env.get('GROQ_API_KEY'),
            GEMINI_API_KEY: Deno.env.get('GEMINI_API_KEY'),
            MISTRAL_API_KEY: Deno.env.get('MISTRAL_API_KEY'),
        };
        // „Configurat" acum înseamnă: avem baza + cel puțin un pas de cascadă cu cheie pusă în secrete.
        if (!supabaseUrl || !anonKey || !serviceRoleKey || !hasUsableStep(providerKeys, enableOpenAI)) {
            return json({ error: 'Chatul AI nu este configurat încă.' }, 503);
        }
        const authHeader = req.headers.get('Authorization');
        const admin = createClient(supabaseUrl, serviceRoleKey, {
            auth: { persistSession: false, autoRefreshToken: false },
        });
        let user: {
            id: string;
            is_anonymous?: boolean;
        } | null = null;
        if (authHeader?.startsWith('Bearer ')) {
            const token = authHeader.slice('Bearer '.length);
            const userClient = createClient(supabaseUrl, anonKey, {
                global: { headers: { Authorization: authHeader } },
                auth: { persistSession: false, autoRefreshToken: false },
            });
            const { data: userData } = await userClient.auth.getUser(token);
            user = userData.user;
        }
        let body: RequestBody;
        try {
            const parsed: unknown = await req.json();
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                return json({ error: 'Cererea nu este validă.' }, 400);
            }
            body = parsed;
        }
        catch {
            return json({ error: 'Cererea nu este validă.' }, 400);
        }
        const message = typeof body.message === 'string' ? body.message.trim() : '';
        const requestedThreadId = typeof body.threadId === 'string' ? body.threadId : null;
        if (!user)
            return json({ error: 'Autentificare necesară pentru chat.' }, 401);
        if (!message || message.length > 1200) {
            return json({ error: 'Întrebarea trebuie să aibă între 1 și 1.200 de caractere.' }, 400);
        }
        const isAnonymous = user?.is_anonymous === true;
        let threadId = requestedThreadId;
        if (!user || isAnonymous) {
            threadId = null;
        }
        else if (threadId) {
            const { data: ownedThread } = await admin
                .from('chat_threads')
                .select('id')
                .eq('id', threadId)
                .eq('user_id', user.id)
                .maybeSingle();
            if (!ownedThread)
                return json({ error: 'Conversația nu a fost găsită.' }, 404);
        }
        // ── Limits: identity/day (SQL), device+IP/day, IP/day, global month ─────────────
        // Without a salt there is no way to build a client identity, and serving the request
        // anyway would spend without the brake: refusing is the only safe answer.
        const limitSalt = (Deno.env.get('AI_LIMIT_SALT') ?? serviceRoleKey).trim();
        if (limitSalt.length === 0 || typeof globalThis.crypto?.subtle?.digest !== 'function') {
            return json({ error: 'Chatul AI nu este configurat încă.' }, 503);
        }
        // C13: fără adresă de client NU cădem într-un contor comun. Cheia de IP cade pe semnalul de
        // dispozitiv; dacă lipsește și acela, cererea nu poate fi identificată și e refuzată înainte
        // de a consuma din bugetul lunii (fail-closed), în loc să servească nelimitat sau să blocheze
        // toți utilizatorii pe un singur contor.
        const identity = buildLimitIdentity(clientAddress(req), deviceSignal(req));
        if (!identity) {
            return json({
                error: 'Cererea nu a putut fi identificată. Reinstalează aplicația sau încearcă mai târziu.',
                code: 'client_unidentified',
            }, 400);
        }
        const clientHash = await sha256Hex(`${limitSalt}|device|${identity.client}`);
        const ipHash = await sha256Hex(`${limitSalt}|ip|${identity.ip}`);
        const { data: reservation, error: reservationError } = await admin.rpc('reserve_ai_request', {
            p_user_id: user.id,
            p_guest_id: null,
            p_client_hash: clientHash,
            p_ip_hash: ipHash,
        }).single<Reservation>();
        if (reservationError || !reservation || typeof reservation.success !== 'boolean' ||
            ![FREE_DAILY_AI_LIMIT, PREMIUM_DAILY_AI_LIMIT].includes(reservation.daily_limit) ||
            reservation.client_limit !== CLIENT_DAILY_LIMIT ||
            !Number.isInteger(reservation.remaining_limit) || reservation.remaining_limit < 0 ||
            reservation.remaining_limit > reservation.daily_limit ||
            !Number.isInteger(reservation.monthly_remaining) || reservation.monthly_remaining < 0) {
            return json({ error: 'Limita zilnică nu a putut fi verificată.' }, 500);
        }
        const denialReason = reservation.denial_reason;
        const retryAfter = reservation.retry_after_seconds;
        const maxRetrySeconds = denialReason === 'monthly_cap' ? MAX_MONTHLY_RETRY_SECONDS : 5;
        if ((denialReason !== null && !DENIAL_REASONS.includes(denialReason)) ||
            !Number.isInteger(retryAfter) || retryAfter < 0 || retryAfter > maxRetrySeconds ||
            (reservation.success && (denialReason !== null || retryAfter !== 0)) ||
            (!reservation.success && denialReason === null) ||
            (denialReason === 'daily_limit' && (reservation.remaining_limit !== 0 || retryAfter !== 0)) ||
            (denialReason === 'client_limit' && (reservation.remaining_limit !== 0 || retryAfter !== 0)) ||
            (denialReason === 'ip_limit' && (reservation.remaining_limit !== 0 || retryAfter !== 0)) ||
            (denialReason === 'monthly_cap' && (reservation.remaining_limit !== 0 || retryAfter < 1 || reservation.monthly_remaining !== 0)) ||
            (denialReason === 'cooldown' && (reservation.remaining_limit <= 0 || retryAfter < 1))) {
            return json({ error: 'Limita zilnic\u0103 nu a putut fi verificat\u0103.' }, 500);
        }
        const dailyLimit: number = reservation.daily_limit;
        if (!reservation.success) {
            if (denialReason === 'cooldown') {
                return json({
                    error: 'A\u0219teapt\u0103 c\u00e2teva secunde \u00eenainte de urm\u0103torul mesaj.',
                    code: 'cooldown',
                    remaining: reservation.remaining_limit,
                    dailyLimit,
                    retryAfter,
                }, 429);
            }
            if (denialReason === 'monthly_cap') {
                // The provider bill, not a single account: the same answer for everyone, and it
                // says when the budget resets instead of inviting a retry that cannot work.
                return json({
                    error: 'Bugetul lunar de mesaje AI a fost atins. Chatul revine la \u00eenceputul lunii urm\u0103toare.',
                    code: 'monthly_cap',
                    remaining: 0,
                    dailyLimit,
                    retryAfter,
                    monthlyRemaining: 0,
                }, 429);
            }
            if (denialReason === 'client_limit' || denialReason === 'ip_limit') {
                return json({
                    error: denialReason === 'client_limit'
                        ? 'Limita de mesaje pentru acest dispozitiv a fost atins\u0103 ast\u0103zi. \u00cencearc\u0103 din nou m\u00e2ine.'
                        : 'Limita de mesaje pentru aceast\u0103 re\u021bea a fost atins\u0103 ast\u0103zi. \u00cencearc\u0103 din nou m\u00e2ine.',
                    code: denialReason,
                    remaining: 0,
                    dailyLimit,
                    retryAfter: 0,
                }, 429);
            }
            return json({
                error: 'Limita de mesaje a fost atins\u0103. \u00cencearc\u0103 din nou mai t\u00e2rziu.',
                code: 'daily_limit',
                remaining: 0,
                dailyLimit,
                retryAfter: 0,
            }, 429);
        }
        if (user && !isAnonymous && !threadId) {
            const { data: newThread, error: threadError } = await admin
                .from('chat_threads')
                .insert({ user_id: user.id, title: message.slice(0, 80) })
                .select('id')
                .single();
            if (threadError || !newThread)
                return json({ error: 'Conversația nu a putut fi creată.' }, 500);
            threadId = newThread.id;
        }
        let savedUserMessage: {
            id: string;
        } | null = null;
        let history: {
            role: 'user' | 'assistant';
            content: string;
        }[] = [{ role: 'user', content: message }];
        if (user && !isAnonymous && threadId) {
            const savedMessageResult = await admin
                .from('chat_messages')
                .insert({ thread_id: threadId, user_id: user.id, role: 'user', content: message })
                .select('id')
                .single();
            savedUserMessage = savedMessageResult.data;
            if (savedMessageResult.error || !savedUserMessage)
                return json({ error: 'Mesajul nu a putut fi salvat.' }, 500);
            const historyResult = await admin
                .from('chat_messages')
                .select('role, content')
                .eq('thread_id', threadId)
                .order('created_at', { ascending: false })
                .limit(12);
            if (historyResult.error) {
                await admin.from('chat_messages').delete().eq('id', savedUserMessage.id);
                return json({ error: 'Istoricul conversației nu a putut fi citit.' }, 500);
            }
            history = (historyResult.data ?? []) as {
                role: 'user' | 'assistant';
                content: string;
            }[];
        }
        // 2. Cascada de furnizori AI (toți gratuiți): primul pas care mai are loc azi răspunde.
        //    Contractele rămân cele de dinainte, alese prin `Accept`:
        //      · fără `text/event-stream` → JSON {reply, threadId, remaining, dailyLimit} (aplicația v4)
        //      · cu `text/event-stream`    → SSE  meta · delta · done · error (clientul din repo)
        const wantsStream = (req.headers.get('Accept') ?? '').toLowerCase().includes('text/event-stream');
        const aiStartedAt = Date.now();
        const encoder = new TextEncoder();
        const upstreamAbort = new AbortController();
        let idleTimer: ReturnType<typeof setTimeout> | undefined;
        const totalTimer = setTimeout(() => upstreamAbort.abort(), AI_TOTAL_TIMEOUT_MS);
        const bumpIdle = () => {
            if (idleTimer !== undefined)
                clearTimeout(idleTimer);
            idleTimer = setTimeout(() => upstreamAbort.abort(), AI_IDLE_TIMEOUT_MS);
        };
        const clearTimers = () => {
            if (idleTimer !== undefined)
                clearTimeout(idleTimer);
            clearTimeout(totalTimer);
        };
        /** Curăță mesajul optimist al utilizatorului când răspunsul nu poate fi livrat (ca înainte). */
        const dropSavedUserMessage = async () => {
            if (savedUserMessage)
                await admin.from('chat_messages').delete().eq('id', savedUserMessage.id);
        };
        const modelHistory = (history ?? []).reverse().map((item) => ({ role: item.role, content: item.content }));
        const MAX_OUTPUT_TOKENS = 700;
        /** Textul adunat de la furnizorul care a răspuns; până la primul text nu a plecat nimic spre client. */
        let reply = '';
        /** Streamul furnizorului care a răspuns (doar pe calea SSE). */
        let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
        const decoder = new TextDecoder();
        let carry = '';
        let queue: ModelFrame[] = [];
        let ended = false;
        let failed = false;
        let ttftMs = 0;
        /** Pasul care a răspuns efectiv: el dă adresa, modelul și forma cadrelor. */
        let usedStep: ChainStep | null = null;
        /** Contoarele zilei cunoscute în acest proces: un pas epuizat nu mai e cerut a doua oară. */
        const counters: Record<string, number> = {};
        const exhausted = (id: string) => {
            const step = AI_CHAIN.find((candidate) => candidate.id === id);
            if (step)
                counters[id] = step.switchAt;
        };
        /**
         * Ultima valoare raportată de furnizor (`x-ratelimit-remaining-requests`) se scrie în tabelă,
         * dar NU are voie să strice răspunsul: o statistică nu merită un 502.
         */
        const recordProviderRemaining = (stepId: string, headers: Headers) => {
            const remaining = preferredRemainingHeader(headers);
            if (remaining === null)
                return;
            try {
                const pending = admin.rpc('record_ai_provider_remaining', { p_step: stepId, p_remaining: remaining });
                void Promise.resolve(pending).catch(() => undefined);
            }
            catch {
                // ignorat intenționat: doar o statistică
            }
        };
        /**
         * Încearcă un pas: rezervă atomic o cerere în bază, cheamă furnizorul, iar pe calea SSE citește
         * până la PRIMA bucată de text. Până acolo nu am trimis nimic aplicației, deci un eșec poate
         * însemna „treci la următorul furnizor" sau, dacă toți cad, exact eroarea de dinainte.
         */
        const attemptStep = async (step: ChainStep, key: string): Promise<boolean> => {
            bumpIdle();
            let upstream: Response;
            try {
                upstream = await fetch(requestUrl(step), {
                    method: 'POST',
                    signal: upstreamAbort.signal,
                    headers: authHeaders(step, key),
                    body: JSON.stringify(step.api === 'responses'
                        ? {
                            model: step.model,
                            instructions: systemInstructions,
                            input: modelHistory,
                            reasoning: { effort: 'none' },
                            text: { verbosity: 'low' },
                            max_output_tokens: 700,
                            safety_identifier: user.id,
                            store: false,
                            stream: wantsStream,
                        }
                        : {
                            model: step.model,
                            messages: [{ role: 'system', content: systemInstructions }, ...modelHistory],
                            max_tokens: MAX_OUTPUT_TOKENS,
                            stream: wantsStream,
                        }),
                });
            }
            catch {
                return false;
            }
            // 429 / 402 / 5xx / răspuns fără corp: pasul e considerat indisponibil ACUM, trecem mai departe.
            if (!upstream.ok || !upstream.body)
                return false;
            recordProviderRemaining(step.id, upstream.headers);
            if (!wantsStream) {
                try {
                    const payload: unknown = await upstream.json();
                    const text = extractText(payload, step.api).trim();
                    if (!text)
                        return false;
                    reply = text;
                    ttftMs = Date.now() - aiStartedAt;
                    return true;
                }
                catch {
                    return false;
                }
            }
            const upstreamReader = upstream.body.getReader();
            reader = upstreamReader;
            carry = '';
            queue = [];
            ended = false;
            failed = false;
            try {
                for (;;) {
                    const { done, value } = await upstreamReader.read();
                    if (done) {
                        ended = true;
                        break;
                    }
                    bumpIdle();
                    carry += decoder.decode(value, { stream: true }).replace(/\r/g, '');
                    const parsed = takeFrames(carry);
                    carry = parsed.rest;
                    let found = false;
                    for (let index = 0; index < parsed.frames.length; index += 1) {
                        const frame = parsed.frames[index];
                        if (frameFailed(frame)) {
                            failed = true;
                            break;
                        }
                        const delta = extractDelta(frame, step.api);
                        if (delta) {
                            reply = delta;
                            // Cadrele din aceeași bucată rămase neprocesate nu se pierd.
                            queue = parsed.frames.slice(index + 1);
                            found = true;
                            break;
                        }
                        if (frame.event === 'done') {
                            ended = true;
                            break;
                        }
                    }
                    if (found || failed || ended)
                        break;
                }
            }
            catch {
                failed = true;
            }
            if (failed || !reply)
                return false;
            ttftMs = Date.now() - aiStartedAt;
            return true;
        };
        try {
            for (;;) {
                const step = pickStep(counters, { enableOpenAI });
                if (!step)
                    break;
                const key = (providerKeys[step.keyEnv] ?? '').trim();
                if (!key) {
                    // Cheia lipsește din secretele Supabase: pasul nu poate fi folosit, dar nu blocăm restul.
                    exhausted(step.id);
                    continue;
                }
                // Poarta atomică din bază: două cereri simultane nu pot trece amândouă de prag.
                const gateResult = await admin.rpc('reserve_ai_provider_step', {
                    p_step: step.id,
                    p_switch_at: step.switchAt,
                }).single<{ allowed: boolean; requests: number }>();
                const gate = gateResult.data;
                if (gateResult.error || !gate || typeof gate.allowed !== 'boolean') {
                    // Contorul zilei nu e disponibil (migraţia lipseşte sau baza ezită): un defect de
                    // infrastructură nu are voie să oprească chatul. Mergem mai departe la furnizor;
                    // dacă el e chiar la plafon, răspunde 429 şi cascada trece singură la pasul următor.
                    console.warn('chat: poarta pasului nu a răspuns', step.id);
                }
                else if (!gate.allowed) {
                    exhausted(step.id);
                    continue;
                }
                const requests = gate && Number.isInteger(gate.requests) ? gate.requests : step.switchAt;
                counters[step.id] = Math.min(requests, step.switchAt);
                if (await attemptStep(step, key)) {
                    usedStep = step;
                    break;
                }
                // Pasul a refuzat acum: pentru cererea aceasta nu-l mai încercăm; următoarea îl poate
                // testa din nou, iar contorul din bază rămâne singura sursă de adevăr pentru zi.
                exhausted(step.id);
            }
        }
        catch {
            clearTimers();
            await dropSavedUserMessage();
            return json({ error: AI_UNAVAILABLE_MESSAGE }, 502);
        }
        if (!reply || !usedStep) {
            clearTimers();
            await dropSavedUserMessage();
            return json({ error: AI_UNAVAILABLE_MESSAGE }, 502);
        }
        // Măsurătoarea cerută de OB.1: timpul până la primul text, scris în logurile funcției.
        console.log('chat-stream ttft', JSON.stringify({ ttftMs }));
        // Un singur rând de log, fără secrete: cine a răspuns, nu cu ce cheie.
        console.log('chat', JSON.stringify({
            step: usedStep.id,
            provider: usedStep.provider,
            streaming: wantsStream,
            ttftMs,
            totalMs: Date.now() - aiStartedAt,
        }));
        const quota = { threadId, remaining: reservation.remaining_limit, dailyLimit };

        /**
         * Istoricul se scrie doar pentru conturi reale, niciodată pentru anonimi, şi o singură dată
         * per răspuns: pe calea JSON imediat, pe calea SSE la finalul streamului, după ce textul a
         * plecat deja spre aplicaţie. Un singur loc ⇒ nicio cale nu poate uita gardul de cont real.
         */
        const saveAssistantReply = async (): Promise<boolean> => {
            if (user && !isAnonymous && threadId) {
                const { error: saveAssistantError } = await admin
                    .from('chat_messages')
                    .insert({ thread_id: threadId, user_id: user.id, role: 'assistant', content: reply });
                if (saveAssistantError)
                    return false;
                await admin
                    .from('chat_threads')
                    .update({ updated_at: new Date().toISOString() })
                    .eq('id', threadId)
                    .eq('user_id', user.id);
            }
            return true;
        };

        // ── Calea NON-stream: contractul JSON de dinainte (aplicația instalată, v4) ─────────────
        if (!wantsStream) {
            clearTimers();
            try {
                if (!(await saveAssistantReply()))
                    return json({ error: 'Răspunsul a fost generat, dar nu a putut fi salvat.' }, 500);
            }
            catch {
                return json({ error: 'Răspunsul a fost generat, dar nu a putut fi salvat.' }, 500);
            }
            console.log('chat-stream total', JSON.stringify({
                totalMs: Date.now() - aiStartedAt,
                chars: reply.length,
            }));
            return json({ reply, threadId, remaining: reservation.remaining_limit, dailyLimit });
        }

        // ── Calea SSE: meta · delta · done · error (clientul nou din repo) ──────────────────────
        let clientGone = false;
        /**
         * De aici înainte răspunsul e un stream SSE, iar aplicația afișează fiecare bucată când sosește.
         * Contoarele pleacă ÎNAINTE de text, ca bara de cotă să fie corectă din prima secundă și ca un
         * text care sosește să nu rămână niciodată fără context.
         */
        const stream = new ReadableStream({
            async start(controller) {
                const send = (frame: string) => {
                    if (!clientGone)
                        controller.enqueue(encoder.encode(frame));
                };
                send(sseFrame('meta', quota));
                send(sseFrame(null, { delta: reply }));
                try {
                    for (;;) {
                        for (const frame of queue) {
                            if (frameFailed(frame)) {
                                failed = true;
                                break;
                            }
                            const delta = extractDelta(frame, usedStep.api);
                            if (delta) {
                                reply += delta;
                                send(sseFrame(null, { delta }));
                            }
                        }
                        queue = [];
                        if (failed || ended || clientGone)
                            break;
                        const activeReader = reader;
                        if (activeReader === null)
                            break;
                        const { done, value } = await activeReader.read();
                        if (done) {
                            ended = true;
                            break;
                        }
                        bumpIdle();
                        carry += decoder.decode(value, { stream: true }).replace(/\r/g, '');
                        const parsed = takeFrames(carry);
                        carry = parsed.rest;
                        queue = parsed.frames;
                    }
                }
                catch {
                    failed = true;
                }
                clearTimers();
                if (clientGone)
                    return;
                if (failed) {
                    console.warn('chat-stream: modelul a întrerupt răspunsul', threadId ?? 'guest');
                    await dropSavedUserMessage();
                    // Eroare la mijlocul streamului: mesaj clar, nu balon gol și nu spinner veșnic.
                    send(sseFrame('error', { message: AI_UNAVAILABLE_MESSAGE }));
                    controller.close();
                    return;
                }
                // Istoricul se scrie la FINALUL streamului, după ce textul a plecat deja spre aplicație.
                try {
                    if (!(await saveAssistantReply()))
                        throw new Error('assistant insert failed');
                    send(sseFrame('done', {}));
                }
                catch {
                    send(sseFrame('error', { message: 'Răspunsul a fost generat, dar nu a putut fi salvat.' }));
                }
                console.log('chat-stream total', JSON.stringify({
                    totalMs: Date.now() - aiStartedAt,
                    chars: reply.length,
                }));
                controller.close();
            },
            cancel() {
                // Aplicația a plecat (sau a anulat): oprim și apelul către furnizor, ca să nu consumăm
                // cotă pentru un răspuns pe care nimeni nu îl mai citește. Răspunsul parțial NU se salvează.
                clientGone = true;
                clearTimers();
                const activeReader = reader;
                if (activeReader)
                    void activeReader.cancel().catch(() => undefined);
                upstreamAbort.abort();
            },
        });
        return new Response(stream, {
            status: 200,
            headers: { ...corsHeaders(req, ALLOWED_HEADERS), ...SSE_RESPONSE_HEADERS },
        });
    }
    catch {
        return json({ error: 'Serviciul nu este disponibil. Încearcă din nou mai târziu.' }, 500);
    }
});
