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
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  error?: { message?: string };
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
    if (item.type !== 'message') continue;
    for (const content of item.content ?? []) {
      if (content.type === 'output_text' && typeof content.text === 'string' && content.text.trim()) {
        return content.text.trim();
      }
    }
  }

  return '';
}

function bucharestDateKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Bucharest',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Metodă neacceptată.' }, 405);

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

  let user: { id: string } | null = null;
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
    body = await req.json();
  } catch {
    return json({ error: 'Cererea nu este validă.' }, 400);
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const requestedThreadId = typeof body.threadId === 'string' ? body.threadId : null;
  const guestId = typeof body.guestId === 'string' && /^guest-[A-Za-z0-9-]{16,80}$/.test(body.guestId)
    ? body.guestId
    : null;
  if (!user && !guestId) return json({ error: 'Autentificare necesară sau identificator de vizitator invalid.' }, 401);
  if (!message || message.length > 1200) {
    return json({ error: 'Întrebarea trebuie să aibă între 1 și 1.200 de caractere.' }, 400);
  }

  const usageDate = bucharestDateKey();
  let dailyLimit = FREE_DAILY_AI_LIMIT;
  let usedMessages = 0;
  if (user) {
    const [usageResult, subscriptionResult] = await Promise.all([
      admin
        .from('usage_daily')
        .select('ai_messages')
        .eq('user_id', user.id)
        .eq('usage_date', usageDate)
        .maybeSingle(),
      admin
        .from('subscriptions')
        .select('status, current_period_end')
        .eq('user_id', user.id)
        .maybeSingle(),
    ]);
    if (usageResult.error || subscriptionResult.error) return json({ error: 'Limita zilnică nu a putut fi verificată.' }, 500);
    const subscription = subscriptionResult.data;
    const periodIsActive = !subscription?.current_period_end || new Date(subscription.current_period_end).getTime() > Date.now();
    // 'canceled' păstrează accesul până la sfârșitul perioadei plătite.
    const isPremium = Boolean(subscription && ['active', 'trialing', 'canceled'].includes(subscription.status) && periodIsActive);
    dailyLimit = isPremium ? PREMIUM_DAILY_AI_LIMIT : FREE_DAILY_AI_LIMIT;
    usedMessages = usageResult.data?.ai_messages ?? 0;
  } else {
    const guestUsageResult = await admin
      .from('guest_usage_daily')
      .select('ai_messages')
      .eq('guest_id', guestId)
      .eq('usage_date', usageDate)
      .maybeSingle();
    if (guestUsageResult.error) return json({ error: 'Limita zilnică nu a putut fi verificată.' }, 500);
    usedMessages = guestUsageResult.data?.ai_messages ?? 0;
  }
  if (usedMessages >= dailyLimit) return json({ error: `Ai folosit cele ${dailyLimit} de mesaje disponibile azi.` }, 429);

  let threadId = requestedThreadId;
  if (!user) {
    threadId = null;
  } else if (threadId) {
    const { data: ownedThread } = await admin
      .from('chat_threads')
      .select('id')
      .eq('id', threadId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!ownedThread) return json({ error: 'Conversația nu a fost găsită.' }, 404);
  } else {
    const { data: newThread, error: threadError } = await admin
      .from('chat_threads')
      .insert({ user_id: user.id, title: message.slice(0, 80) })
      .select('id')
      .single();
    if (threadError || !newThread) return json({ error: 'Conversația nu a putut fi creată.' }, 500);
    threadId = newThread.id;
  }

  let savedUserMessage: { id: string } | null = null;
  let history: Array<{ role: 'user' | 'assistant'; content: string }> = [{ role: 'user', content: message }];
  if (user && threadId) {
    const savedMessageResult = await admin
      .from('chat_messages')
      .insert({ thread_id: threadId, user_id: user.id, role: 'user', content: message })
      .select('id')
      .single();
    savedUserMessage = savedMessageResult.data;
    if (savedMessageResult.error || !savedUserMessage) return json({ error: 'Mesajul nu a putut fi salvat.' }, 500);

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
    history = (historyResult.data ?? []) as Array<{ role: 'user' | 'assistant'; content: string }>;
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
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
      safety_identifier: user?.id ?? guestId,
      store: false,
    }),
  });

  const openAIResult = await response.json() as OpenAIOutput;
  const reply = response.ok ? extractReply(openAIResult) : '';

  if (!reply) {
    console.error('OpenAI request failed', response.status, openAIResult.error?.message ?? 'empty response');
    if (savedUserMessage) await admin.from('chat_messages').delete().eq('id', savedUserMessage.id);
    return json({ error: 'Serviciul AI nu a răspuns. Încearcă din nou mai târziu.' }, 502);
  }

  if (user && threadId) {
    const { error: saveAssistantError } = await admin
      .from('chat_messages')
      .insert({ thread_id: threadId, user_id: user.id, role: 'assistant', content: reply });
    if (saveAssistantError) return json({ error: 'Răspunsul a fost generat, dar nu a putut fi salvat.' }, 500);
  }

  const nextUsage = usedMessages + 1;
  const usageUpdateError = user
    ? (await admin
      .from('usage_daily')
      .upsert({ user_id: user.id, usage_date: usageDate, ai_messages: nextUsage }, { onConflict: 'user_id,usage_date' })).error
    : (await admin
      .from('guest_usage_daily')
      .upsert({ guest_id: guestId, usage_date: usageDate, ai_messages: nextUsage }, { onConflict: 'guest_id,usage_date' })).error;

  if (usageUpdateError) console.error('Usage update failed', usageUpdateError.message);

  if (user && threadId) {
    await admin
      .from('chat_threads')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', threadId)
      .eq('user_id', user.id);
  }

  return json({ reply, threadId, remaining: Math.max(0, dailyLimit - nextUsage), dailyLimit });
});
