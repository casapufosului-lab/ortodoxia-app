/**
 * Testele cascadei de furnizori (09.10.2026).
 *
 * Se rulează cu `npm run test:ai-chain` (runner-ul proiectului, `--filter ai-chain`) și NU ating
 * nicio rețea: `fetch` e fals, iar modulul testat e pur (ordine, prag, cereri, parsare).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    AI_CHAIN,
    authHeaders,
    chatCompletionsUrl,
    extractDelta,
    extractText,
    frameFailed,
    hasUsableStep,
    isQuotaError,
    OPENAI_STEP_ID,
    pickStep,
    preferredRemainingHeader,
    requestUrl,
    stepEnabled,
    type ChainStep,
} from './ai-chain.ts';

/** Ordinea cerută de owner (id → prag de comutare), exact tabelul din task. */
const EXPECTED_ORDER = [
    ['openai-free', 49],
    ['groq-120b', 999],
    ['groq-qwen', 999],
    ['groq-20b', 999],
    ['gemini-flash', 1000],
    ['gemini-flash-lite', 1000],
    ['mistral-nemo', 1000],
    ['mistral-ministral', 1000],
    ['groq-allam', 6999],
] as const;

const allEnabledButOpenAI = AI_CHAIN.filter((step) => step.id !== OPENAI_STEP_ID);

test('ordinea cascadei e exact cea cerută, iar OpenAI e stins implicit', () => {
    assert.deepEqual(AI_CHAIN.map((step) => [step.id, step.switchAt]), EXPECTED_ORDER.map(([id, at]) => [id, at]));
    const openai = AI_CHAIN.find((step) => step.id === OPENAI_STEP_ID);
    assert.ok(openai, 'pasul OpenAI trebuie să existe în listă (ownerul poate plăti mai târziu)');
    assert.equal(openai.enabled, false, 'cu 0 credite, pasul OpenAI nu are voie să fie activ implicit');
    assert.equal(stepEnabled(openai, false), false);
    assert.equal(stepEnabled(openai, true), true, 'se aprinde din configurare, fără modificare de cod');
    for (const step of allEnabledButOpenAI) assert.equal(stepEnabled(step, false), true, `${step.id} e gratuit și activ`);
});

test('fără contoare, primul pas folosit este primul furnizor gratuit', () => {
    assert.equal(pickStep({})?.id, 'groq-120b');
    assert.equal(pickStep({}, { enableOpenAI: false })?.id, 'groq-120b');
    assert.equal(pickStep({}, { enableOpenAI: true })?.id, OPENAI_STEP_ID, 'cu OpenAI aprins, el e primul');
});

test('pragul: la 999 din 1000 pasul e sărit pentru restul zilei', () => {
    assert.equal(pickStep({ 'groq-120b': 998 })?.id, 'groq-120b');
    assert.equal(pickStep({ 'groq-120b': 999 })?.id, 'groq-qwen', 'exact cerința ownerului');
    assert.equal(pickStep({ 'groq-120b': 999, 'groq-qwen': 999, 'groq-20b': 999 })?.id, 'gemini-flash');
    assert.equal(
        pickStep({ 'groq-allam': 6999 })?.id,
        'groq-120b',
        'un pas epuizat nu ascunde pașii dinaintea lui',
    );
});

test('când toate contoarele au atins pragul, nu mai există niciun pas', () => {
    const counters: Record<string, number> = {};
    for (const step of AI_CHAIN) counters[step.id] = step.switchAt;
    assert.equal(pickStep(counters), null);
    assert.equal(pickStep(counters, { enableOpenAI: true }), null);
});

test('adresele sunt exact cele verificate live, pentru fiecare formă de cerere', () => {
    assert.equal(chatCompletionsUrl('https://api.groq.com/openai/v1'), 'https://api.groq.com/openai/v1/chat/completions');
    assert.equal(chatCompletionsUrl('https://api.mistral.ai/v1/'), 'https://api.mistral.ai/v1/chat/completions');
    const groq = AI_CHAIN.find((step) => step.id === 'groq-120b')!;
    assert.equal(requestUrl(groq), 'https://api.groq.com/openai/v1/chat/completions');
    const openai = AI_CHAIN.find((step) => step.id === OPENAI_STEP_ID)!;
    assert.equal(requestUrl(openai), 'https://api.openai.com/v1/responses');
});

test('antetele de autentificare poartă cheia doar în Authorization', () => {
    const step = AI_CHAIN.find((candidate) => candidate.id === 'gemini-flash')!;
    const headers = authHeaders(step, 'cheie-de-test');
    assert.equal(headers.Authorization, 'Bearer cheie-de-test');
    assert.equal(headers['Content-Type'], 'application/json');
    assert.deepEqual(Object.keys(headers).sort(), ['Authorization', 'Content-Type']);
    assert.equal(JSON.stringify(Object.entries(headers).filter(([name]) => name !== 'Authorization')).includes('cheie-de-test'), false);
});

test('extractDelta citește ambele forme de stream (chat și Responses)', () => {
    assert.equal(extractDelta({ event: '', data: { choices: [{ delta: { content: 'Bună' } }] } }, 'chat'), 'Bună');
    assert.equal(extractDelta({ event: 'response.output_text.delta', data: { delta: 'Bună' } }, 'responses'), 'Bună');
    assert.equal(extractDelta({ event: '', data: { choices: [{ delta: {} }] } }, 'chat'), '');
    assert.equal(extractDelta({ event: 'done', data: null }, 'chat'), '');
    assert.equal(extractDelta({ event: '', data: { choices: [] } }, 'chat'), '');
    assert.equal(extractDelta({ event: '', data: 'text brut' }, 'chat'), '');
});

test('extractText citește răspunsul complet din JSON (ambele forme)', () => {
    assert.equal(extractText({ choices: [{ message: { content: 'răspuns' } }] }, 'chat'), 'răspuns');
    assert.equal(extractText({ output_text: 'răspuns' }, 'responses'), 'răspuns');
    assert.equal(
        extractText({ output: [{ content: [{ text: 'bu' }, { text: 'nă' }] }] }, 'responses'),
        'bună',
        'Responses API poate livra textul în bucăți, nu doar în `output_text`',
    );
    assert.equal(extractText({}, 'chat'), '');
    assert.equal(extractText(null, 'chat'), '');
    assert.equal(extractText({ choices: [{ message: {} }] }, 'chat'), '');
});

test('frameFailed prinde doar semnalele de eșec', () => {
    assert.equal(frameFailed({ event: 'error', data: { message: 'boom' } }), true);
    assert.equal(frameFailed({ event: '', data: { error: { message: 'boom' } } }), true);
    assert.equal(frameFailed({ event: '', data: { choices: [{ delta: { content: 'ok' } }] } }), false);
    assert.equal(frameFailed({ event: 'done', data: null }), false);
});

test('isQuotaError: 429/402 sau un corp care spune explicit că e cotă', () => {
    assert.equal(isQuotaError(429, ''), true);
    assert.equal(isQuotaError(402, ''), true, 'Cerebras a răspuns exact așa');
    assert.equal(isQuotaError(200, 'rate limit exceeded'), true);
    assert.equal(isQuotaError(400, { error: { code: 'credit_balance_exhausted' } }), true);
    assert.equal(isQuotaError(400, { error: { message: 'bad request' } }), false);
    assert.equal(isQuotaError(500, undefined), false, 'o eroare de server nu e o cotă epuizată');
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    assert.equal(isQuotaError(500, circular), false, 'un corp neinteligibil nu are voie să arunce');
});

test('preferredRemainingHeader: antetul furnizorului are prioritate când există', () => {
    const headers = (value: string | null) => ({ get: (name: string) => (name.toLowerCase() === 'x-ratelimit-remaining-requests' ? value : null) }) as unknown as Headers;
    assert.equal(preferredRemainingHeader(headers('999')), 999);
    assert.equal(preferredRemainingHeader(headers('0')), 0);
    assert.equal(preferredRemainingHeader(headers(null)), null);
    assert.equal(preferredRemainingHeader(headers('')), null);
    assert.equal(preferredRemainingHeader(headers('mult')), null);
});

test('hasUsableStep: o cheie de OpenAI singură nu mai înseamnă „configurat"', () => {
    const openaiOnly = { OPENAI_API_KEY: 'k' };
    assert.equal(hasUsableStep(openaiOnly, false), false, 'pasul OpenAI e stins, deci nu e folosibil');
    assert.equal(hasUsableStep(openaiOnly, true), true);
    assert.equal(hasUsableStep({ ...openaiOnly, GROQ_API_KEY: 'k' }, false), true);
    assert.equal(hasUsableStep({ GROQ_API_KEY: '   ' }, false), false, 'o cheie goală nu e o cheie');
    assert.equal(hasUsableStep({}, false), false);
});

/**
 * Mini-cascadă cu `fetch` fals: exact bucla din funcție (primul pas care are loc → dacă refuză,
 * pasul e marcat epuizat și se trece la următorul; dacă toți refuză, nu mai există pas).
 */
async function runCascade(respond: (step: ChainStep) => string | null, options: {
    counters?: Record<string, number>;
    enableOpenAI?: boolean;
    keys?: Record<string, string | undefined>;
} = {}) {
    const local: Record<string, number> = { ...(options.counters ?? {}) };
    const attempts: { id: string; url: string; authorization: string }[] = [];
    for (;;) {
        const step = pickStep(local, { enableOpenAI: options.enableOpenAI === true });
        if (!step)
            return { ok: false as const, attempts, steps: attempts.map((attempt) => attempt.id) };
        const key = options.keys?.[step.keyEnv] ?? 'cheie-de-test';
        if (!key.trim()) {
            local[step.id] = step.switchAt;
            continue;
        }
        attempts.push({ id: step.id, url: requestUrl(step), authorization: authHeaders(step, key).Authorization });
        const text = respond(step);
        if (text !== null)
            return { ok: true as const, step, attempts, steps: attempts.map((attempt) => attempt.id), text };
        local[step.id] = step.switchAt;
    }
}

test('429 de la primul furnizor => răspunde al doilea, fără ca clientul să afle', async () => {
    const result = await runCascade((step) => (step.id === 'groq-120b' ? null : 'răspuns de la al doilea'));
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.step.id, 'groq-qwen');
    assert.deepEqual(result.steps, ['groq-120b', 'groq-qwen']);
    assert.equal(result.attempts[1].url, 'https://api.groq.com/openai/v1/chat/completions');
    assert.equal(result.ok && result.text, 'răspuns de la al doilea');
});

test('când toți pașii refuză, cascada se termină fără răspuns (funcția răspunde 502)', async () => {
    const result = await runCascade(() => null);
    assert.equal(result.ok, false);
    assert.deepEqual(
        result.steps,
        allEnabledButOpenAI.map((step) => step.id),
        'se încearcă toți furnizorii gratuiți, în ordine, o singură dată fiecare',
    );
    assert.equal(result.steps.includes(OPENAI_STEP_ID), false, 'pasul OpenAI stins nu e nici măcar încercat');
});

test('un pas sărit de prag nu e nici măcar chemat', async () => {
    const result = await runCascade(() => 'ok', { counters: { 'groq-120b': 999, 'groq-qwen': 999 } });
    assert.equal(result.ok, true);
    assert.deepEqual(result.steps, ['groq-20b']);
});

test('pașii pot folosi chei diferite: un secret lipsă nu blochează furnizorul următor', async () => {
    const result = await runCascade((step) => (step.provider === 'groq' ? null : 'ok'), {
        keys: { GROQ_API_KEY: 'k', MISTRAL_API_KEY: '   ', GEMINI_API_KEY: 'k' },
    });
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.step.id, 'gemini-flash');
});
