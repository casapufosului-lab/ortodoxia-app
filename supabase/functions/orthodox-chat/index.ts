import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders as buildCorsHeaders, preflightResponse } from '../_shared/http.ts';
import { buildLimitIdentity, normalizeAddress, normalizeDevice } from './limit-identity.ts';

const ALLOWED_HEADERS = 'authorization, x-client-info, apikey, content-type';

/** CORS headers for this request; the origin comes from the ALLOWED_ORIGINS secret. */
function corsHeaders(req: Request) {
  return buildCorsHeaders(req, ALLOWED_HEADERS);
}
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
type OpenAIOutput = {
    output_text?: string;
    output?: {
        type?: string;
        content?: {
            type?: string;
            text?: string;
        }[];
    }[];
    error?: {
        message?: string;
    };
};
/**
 * The request currently being handled.
 *
 * json() is called ~60 times across the functions and cannot take the request as a
 * parameter without editing every call site. Deno serves each request in its own task,
 * and the value is assigned synchronously at the top of the handler and read before the
 * handler returns, so a module-level marker is not observable across requests.
 */
let activeRequest: Request | null = null;

function json(body: Record<string, unknown>, status = 200) {
  const req = activeRequest;
  if (!req) {
    // Defensive: never emit CORS headers for an unknown origin.
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
}
function extractReply(payload: OpenAIOutput) {
    if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
        return payload.output_text.trim();
    }
    for (const item of payload.output ?? []) {
        if (item.type !== 'message')
            continue;
        for (const content of item.content ?? []) {
            if (content.type === 'output_text' && typeof content.text === 'string' && content.text.trim()) {
                return content.text.trim();
            }
        }
    }
    return '';
}
Deno.serve(async (req: Request) => {
  activeRequest = req;
    if (req.method === 'OPTIONS')
        return preflightResponse(req, ALLOWED_HEADERS);
    if (req.method !== 'POST')
        return json({ error: 'Metodă neacceptată.' }, 405);
    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const openAIKey = Deno.env.get('OPENAI_API_KEY');
        if (!supabaseUrl || !anonKey || !serviceRoleKey || !openAIKey) {
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
        // 2. Call OpenAI
        let reply: string;
        try {
            const response = await fetch('https://api.openai.com/v1/responses', {
                method: 'POST',
                signal: AbortSignal.timeout(30000),
                headers: {
                    Authorization: `Bearer ${openAIKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'gpt-5.4-mini',
                    instructions: systemInstructions,
                    input: (history ?? []).reverse().map((item) => ({ role: item.role, content: item.content })),
                    reasoning: { effort: 'none' },
                    text: { verbosity: 'low' },
                    max_output_tokens: 700,
                    safety_identifier: user.id,
                    store: false,
                }),
            });
            const openAIResult = await response.json() as OpenAIOutput;
            reply = response.ok ? extractReply(openAIResult) : '';
        }
        catch {
            if (savedUserMessage)
                await admin.from('chat_messages').delete().eq('id', savedUserMessage.id);
            return json({ error: 'Serviciul AI nu a răspuns. Încearcă din nou mai târziu.' }, 502);
        }
        if (!reply) {
            if (savedUserMessage)
                await admin.from('chat_messages').delete().eq('id', savedUserMessage.id);
            return json({ error: 'Serviciul AI nu a răspuns. Încearcă din nou mai târziu.' }, 502);
        }
        if (user && !isAnonymous && threadId) {
            const { error: saveAssistantError } = await admin
                .from('chat_messages')
                .insert({ thread_id: threadId, user_id: user.id, role: 'assistant', content: reply });
            if (saveAssistantError)
                return json({ error: 'Răspunsul a fost generat, dar nu a putut fi salvat.' }, 500);
        }
        if (user && !isAnonymous && threadId) {
            await admin
                .from('chat_threads')
                .update({ updated_at: new Date().toISOString() })
                .eq('id', threadId)
                .eq('user_id', user.id);
        }
        return json({ reply, threadId, remaining: reservation.remaining_limit, dailyLimit });
    }
    catch {
        return json({ error: 'Serviciul nu este disponibil. Încearcă din nou mai târziu.' }, 500);
    }
});
