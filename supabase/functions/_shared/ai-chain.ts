/**
 * Cascada de furnizori AI gratuiți (09.10.2026).
 *
 * DE CE EXISTĂ
 * ------------
 * Până acum funcția `orthodox-chat` vorbea cu UN singur furnizor (OpenAI). Când contul acela a
 * rămas fără credite, fiecare cerere a primit `429 credit_balance_exhausted` și chatul a picat în
 * producție cu 502, pentru TOȚI utilizatorii, fără ca vreunul să fi greșit ceva. Cascada schimbă
 * răspunsul la întrebarea „ce facem când un furnizor își atinge plafonul?" din „picăm" în
 * „trecem la următorul, iar utilizatorul nu observă nimic".
 *
 * Acest modul conține DOAR logica pură: ordinea pașilor, construcția cererilor, parsarea
 * răspunsurilor și decizia „merită încercat pasul acesta?" (pragul zilei). Nu face rețea și nu
 * citește secrete, deci poate fi testat cu `fetch` fals, fără să atingă niciun furnizor real.
 *
 * CINE ȚINE CONTORUL: funcția Edge e fără stare, deci contorul zilei trăiește în baza de date
 * (`ai_provider_usage_daily`, vezi migrația `*_add_ai_provider_usage_daily.sql`). Aici se
 * calculează doar dacă un pas mai are loc, pe baza contoarelor deja cunoscute.
 */

/** Forma cererii acceptată de un pas: `/chat/completions` (compatibil OpenAI) sau Responses API. */
export type ProviderApi = 'chat' | 'responses';

export type ChainStep = {
    /** Identificatorul stabil din baza de date (`ai_provider_usage_daily.step_id`). */
    readonly id: string;
    readonly provider: 'openai' | 'groq' | 'gemini' | 'mistral';
    readonly base: string;
    readonly model: string;
    /**
     * Câte cereri pe zi acceptă pasul ÎNAINTE de comutare: când contorul zilei ajunge la
     * `switchAt`, pasul e sărit pentru restul zilei. „La 999 din 1000 se schimbă."
     */
    readonly switchAt: number;
    /** Numele secretului Supabase care ține cheia. Cheia NU ajunge niciodată în acest fișier. */
    readonly keyEnv: string;
    /** `false` = pasul nu se folosește implicit (îl poate aprinde doar un operator). */
    readonly enabled: boolean;
    readonly api: ProviderApi;
};

/** Pasul OpenAI: există în listă ca ownerul să-l poată pune primul când va plăti, dar e stins azi. */
export const OPENAI_STEP_ID = 'openai-free';

/**
 * Ordinea cascadei — exact tabelul din §3.1. E o listă, deci reordonarea înseamnă mutarea unei
 * linii, nu rescrierea logicii. Toți pașii sunt gratuiți; OpenAI e prezent dar dezactivat.
 */
export const AI_CHAIN: readonly ChainStep[] = [
    {
        id: OPENAI_STEP_ID,
        provider: 'openai',
        base: 'https://api.openai.com/v1',
        model: 'gpt-5.4-mini',
        switchAt: 49,
        keyEnv: 'OPENAI_API_KEY',
        enabled: false,
        api: 'responses',
    },
    {
        id: 'groq-120b',
        provider: 'groq',
        base: 'https://api.groq.com/openai/v1',
        model: 'openai/gpt-oss-120b',
        switchAt: 999,
        keyEnv: 'GROQ_API_KEY',
        enabled: true,
        api: 'chat',
    },
    {
        id: 'groq-qwen',
        provider: 'groq',
        base: 'https://api.groq.com/openai/v1',
        model: 'qwen/qwen3.8-27b',
        switchAt: 999,
        keyEnv: 'GROQ_API_KEY',
        enabled: true,
        api: 'chat',
    },
    {
        id: 'groq-20b',
        provider: 'groq',
        base: 'https://api.groq.com/openai/v1',
        model: 'openai/gpt-oss-20b',
        switchAt: 999,
        keyEnv: 'GROQ_API_KEY',
        enabled: true,
        api: 'chat',
    },
    {
        id: 'gemini-flash',
        provider: 'gemini',
        base: 'https://generativelanguage.googleapis.com/v1beta/openai',
        model: 'gemini-3.8-flash',
        switchAt: 1000,
        keyEnv: 'GEMINI_API_KEY',
        enabled: true,
        api: 'chat',
    },
    {
        id: 'gemini-flash-lite',
        provider: 'gemini',
        base: 'https://generativelanguage.googleapis.com/v1beta/openai',
        model: 'gemini-flash-lite-latest',
        switchAt: 1000,
        keyEnv: 'GEMINI_API_KEY',
        enabled: true,
        api: 'chat',
    },
    {
        id: 'mistral-nemo',
        provider: 'mistral',
        base: 'https://api.mistral.ai/v1',
        model: 'open-mistral-nemo',
        switchAt: 1000,
        keyEnv: 'MISTRAL_API_KEY',
        enabled: true,
        api: 'chat',
    },
    {
        id: 'mistral-ministral',
        provider: 'mistral',
        base: 'https://api.mistral.ai/v1',
        model: 'ministral-8b-latest',
        switchAt: 1000,
        keyEnv: 'MISTRAL_API_KEY',
        enabled: true,
        api: 'chat',
    },
    {
        id: 'groq-allam',
        provider: 'groq',
        base: 'https://api.groq.com/openai/v1',
        model: 'allam-2-7b',
        switchAt: 6999,
        keyEnv: 'GROQ_API_KEY',
        enabled: true,
        api: 'chat',
    },
];

/** Un cadru SSE de la furnizor, deja despicat de `takeFrames` (event + JSON parsat). */
export type StreamFrame = {
    event: string;
    data: unknown;
};

function trimTrailingSlash(value: string) {
    return value.endsWith('/') ? value.slice(0, -1) : value;
}

/** Adresa `/chat/completions` a unui furnizor compatibil OpenAI. */
export function chatCompletionsUrl(base: string) {
    return `${trimTrailingSlash(base)}/chat/completions`;
}

/** Adresa efectivă a pasului: Responses API pentru OpenAI, `/chat/completions` pentru restul. */
export function requestUrl(step: ChainStep) {
    return step.api === 'responses' ? `${trimTrailingSlash(step.base)}/responses` : chatCompletionsUrl(step.base);
}

/** Antetele de autentificare: toți furnizorii folosesc `Authorization: Bearer <cheie>`. */
export function authHeaders(_step: ChainStep, key: string): Record<string, string> {
    return {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
    };
}

/**
 * `true` dacă pasul poate fi folosit acum.
 *
 * Pasul OpenAI are o regulă proprie: `enabled` din listă e implicitul (stins, cont fără credite),
 * iar variabila de mediu `AI_CHAIN_ENABLE_OPENAI=true` e cea care îl aprinde, fără modificare de
 * cod — exact cerința ownerului, ca să poată plăti mai târziu și să-l pună primul.
 */
export function stepEnabled(step: ChainStep, enableOpenAI: boolean) {
    // `step.enabled` e implicitul din listă (stins pentru OpenAI); pentru pasul OpenAI, operatorul
    // îl poate aprinde din mediu, fără să atingă codul.
    if (step.provider === 'openai')
        return enableOpenAI === true;
    return step.enabled;
}

/**
 * Primul pas care mai are loc azi, ținând cont de contoarele deja cunoscute.
 *
 * `counters` sunt cererile deja consumate azi pentru fiecare `step_id`. Un pas se sare dacă
 * `switchAt` a fost atins. Atenție: decizia finală (atomică, cu `for update`) o ia RPC-ul din bază;
 * funcția aceasta doar scurtează drumul, ca să nu cerem degeaba permisiunea pentru un pas epuizat.
 */
export function pickStep(
    counters: Readonly<Record<string, number>>,
    options: { enableOpenAI?: boolean } = {},
): ChainStep | null {
    const enableOpenAI = options.enableOpenAI === true;
    for (const step of AI_CHAIN) {
        if (!stepEnabled(step, enableOpenAI))
            continue;
        const used = counters[step.id] ?? 0;
        if (used >= step.switchAt)
            continue;
        return step;
    }
    return null;
}

/** `true` dacă există cel puțin un pas folosibil ȘI cheia lui e configurată în Supabase. */
export function hasUsableStep(
    keys: Readonly<Record<string, string | undefined>>,
    enableOpenAI: boolean,
) {
    return AI_CHAIN.some(
        (step) => stepEnabled(step, enableOpenAI) && (keys[step.keyEnv] ?? '').trim().length > 0,
    );
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null;
}

/** Textul unei bucăți de răspuns dintr-un cadru SSE, indiferent de forma cererii. */
export function extractDelta(frame: StreamFrame, api: ProviderApi = 'chat') {
    const data = asRecord(frame.data);
    if (!data)
        return '';
    if (api === 'responses') {
        const delta = data.delta;
        return typeof delta === 'string' ? delta : '';
    }
    const choices = data.choices;
    if (!Array.isArray(choices) || choices.length === 0)
        return '';
    const delta = asRecord(asRecord(choices[0])?.delta)?.content;
    return typeof delta === 'string' ? delta : '';
}

/** Textul complet dintr-un răspuns JSON (cerere fără `stream`). */
export function extractText(payload: unknown, api: ProviderApi = 'chat') {
    const data = asRecord(payload);
    if (!data)
        return '';
    if (api === 'responses') {
        if (typeof data.output_text === 'string')
            return data.output_text;
        const output = data.output;
        if (!Array.isArray(output))
            return '';
        let text = '';
        for (const item of output) {
            const content = asRecord(item)?.content;
            if (!Array.isArray(content))
                continue;
            for (const part of content) {
                const piece = asRecord(part)?.text;
                if (typeof piece === 'string')
                    text += piece;
            }
        }
        return text;
    }
    const choices = data.choices;
    if (!Array.isArray(choices) || choices.length === 0)
        return '';
    const content = asRecord(asRecord(choices[0])?.message)?.content;
    return typeof content === 'string' ? content : '';
}

/** `true` când cadrul primit de la furnizor semnalează un eșec în mijlocul streamului. */
export function frameFailed(frame: StreamFrame) {
    if (frame.event === 'error')
        return true;
    return asRecord(frame.data)?.error !== undefined;
}

/**
 * `true` dacă răspunsul înseamnă „furnizorul acesta e epuizat / refuză" și trebuie să trecem la
 * următorul pas: 429 (prea multe cereri), 402 (plata necesară — Cerebras), sau un corp care spune
 * explicit că e vorba de cotă. Nu aruncă niciodată: un corp neinteligibil nu e o eroare de cotă.
 */
export function isQuotaError(status: number, body: unknown) {
    if (status === 429 || status === 402)
        return true;
    let text = '';
    try {
        text = typeof body === 'string' ? body : JSON.stringify(body ?? '');
    }
    catch {
        text = '';
    }
    return /rate limit|quota|insufficient_quota|credit_balance_exhausted/i.test(text);
}

/**
 * Valoarea din antetul de cotă al furnizorului (`x-ratelimit-remaining-requests`, la Groq), dacă
 * există. Când contorul din tabelă și realitatea furnizorului nu sunt de acord, antetul are
 * prioritate: el vine chiar de la sursă. `null` = furnizorul nu raportează nimic (Gemini, Mistral).
 */
export function preferredRemainingHeader(headers: Headers): number | null {
    const raw = headers.get('x-ratelimit-remaining-requests');
    if (raw === null || raw.trim() === '')
        return null;
    const value = Number(raw);
    return Number.isInteger(value) && value >= 0 ? value : null;
}
