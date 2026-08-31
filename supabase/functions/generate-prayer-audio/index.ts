import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-generation-token',
};

const allowedVoices = new Set([
  'alloy',
  'ash',
  'ballad',
  'coral',
  'echo',
  'fable',
  'nova',
  'onyx',
  'sage',
  'shimmer',
  'verse',
  'marin',
  'cedar',
]);

type RequestBody = {
  slug?: unknown;
  voice?: unknown;
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Metodă neacceptată.' }, 405);

  const generationToken = Deno.env.get('PRAYER_AUDIO_GENERATION_TOKEN');
  const requestToken = req.headers.get('x-generation-token');
  if (!generationToken || requestToken !== generationToken) {
    return json({ error: 'Acces neautorizat.' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const openAIKey = Deno.env.get('OPENAI_API_KEY');
  if (!supabaseUrl || !serviceRoleKey || !openAIKey) {
    return json({ error: 'Generatorul audio nu este configurat.' }, 503);
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Cererea nu este validă.' }, 400);
  }

  const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
  const voice = typeof body.voice === 'string' ? body.voice.trim() : 'marin';
  if (!/^[a-z0-9-]+$/.test(slug)) return json({ error: 'Rugăciunea nu este validă.' }, 400);
  if (!allowedVoices.has(voice)) return json({ error: 'Vocea nu este acceptată.' }, 400);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: prayer, error: prayerError } = await admin
    .from('prayers')
    .select('id, slug, title, body, language_code')
    .eq('slug', slug)
    .eq('language_code', 'ro')
    .eq('is_published', true)
    .maybeSingle();

  if (prayerError) return json({ error: 'Rugăciunea nu a putut fi citită.' }, 500);
  if (!prayer) return json({ error: 'Rugăciunea nu a fost găsită.' }, 404);

  const speechResponse = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openAIKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      voice,
      input: `${prayer.title}. ${prayer.body}`,
      instructions: 'Vorbește în limba română, cu o voce caldă, blândă și liniștită. Păstrează o intonație naturală, respectuoasă și senină. Citește rar, fără dramatizare, cu pauze scurte și line la semnele de punctuație.',
      response_format: 'mp3',
      speed: 0.88,
    }),
  });

  if (!speechResponse.ok) {
    const details = await speechResponse.text();
    console.error('OpenAI TTS failed', speechResponse.status, details);
    return json({ error: 'Vocea nu a putut fi generată.' }, 502);
  }

  const audioPath = `ro/${prayer.slug}.mp3`;
  const audioBytes = await speechResponse.arrayBuffer();
  const { error: uploadError } = await admin.storage
    .from('prayer-audio')
    .upload(audioPath, audioBytes, {
      contentType: 'audio/mpeg',
      cacheControl: '31536000',
      upsert: true,
    });

  if (uploadError) {
    console.error('Prayer audio upload failed', uploadError.message);
    return json({ error: 'Fișierul audio nu a putut fi salvat.' }, 500);
  }

  const { error: updateError } = await admin
    .from('prayers')
    .update({ audio_path: audioPath })
    .eq('id', prayer.id);
  if (updateError) {
    console.error('Prayer audio path update failed', updateError.message);
    return json({ error: 'Rugăciunea nu a putut fi legată de fișierul audio.' }, 500);
  }

  return json({
    success: true,
    slug: prayer.slug,
    voice,
    audioPath,
    bytes: audioBytes.byteLength,
  });
});
