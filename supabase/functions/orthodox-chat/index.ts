import { createClient } from 'npm:@supabase/supabase-js@2';
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const FREE_DAILY_AI_LIMIT = 5;
const PREMIUM_DAILY_AI_LIMIT = 50;
const systemInstructions = `Ești un ghid informativ în limba română pentru o aplicație despre credința ortodoxă.
Răspunde clar, cald și concis. Rămâi la întrebările despre rugăciune, calendar, sfinți, termeni și viață duhovnicească ortodoxă.
Nu te prezenta drept preot și nu înlocui sfatul duhovnicului. Pentru decizii personale importante, îndrumă utilizatorul către preotul său.
Nu inventa citate biblice, canoane, sărbători sau poziții oficiale. Dacă nu ești sigur, spune direct că informația trebuie verificată într-o sursă bisericească.
Pentru urgențe medicale sau pericol imediat, recomandă serviciile de urgență și ajutorul unui profesionist.`;
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
function json(body: Record<string, unknown>, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
    if (req.method === 'OPTIONS')
        return new Response('ok', { headers: corsHeaders });
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
        const { data: reservation, error: reservationError } = await admin.rpc('reserve_ai_request', {
            p_user_id: user.id,
            p_guest_id: null,
        }).single<{ success: boolean; remaining_limit: number; daily_limit: number; denial_reason: 'cooldown' | 'daily_limit' | null; retry_after_seconds: number }>();
        if (reservationError || !reservation || typeof reservation.success !== 'boolean' ||
            ![FREE_DAILY_AI_LIMIT, PREMIUM_DAILY_AI_LIMIT].includes(reservation.daily_limit) ||
            !Number.isInteger(reservation.remaining_limit) || reservation.remaining_limit < 0 ||
            reservation.remaining_limit > reservation.daily_limit) {
            return json({ error: 'Limita zilnică nu a putut fi verificată.' }, 500);
        }
        const denialReason = reservation.denial_reason;
        const retryAfter = reservation.retry_after_seconds;
        if ((denialReason !== null && denialReason !== 'cooldown' && denialReason !== 'daily_limit') ||
            !Number.isInteger(retryAfter) || retryAfter < 0 || retryAfter > 5 ||
            (reservation.success && (denialReason !== null || retryAfter !== 0)) ||
            (!reservation.success && denialReason === null) ||
            (denialReason === 'daily_limit' && (reservation.remaining_limit !== 0 || retryAfter !== 0)) ||
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
