import { FunctionsHttpError } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, AppState, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Card, PageHeader, PrimaryButton, Screen } from '@/components/mvp-ui';
import { palette } from '@/constants/palette';
import { type TranslationKey, translatePlural } from '@/i18n/config';
import { getAiLimitDeviceId } from '@/lib/ai-limit-device';
import { chatGuestSupabase, ensureGuestChatSession, supabase } from '@/lib/supabase';
import { FREE_DAILY_AI_LIMIT, hasPremiumAccess, PREMIUM_DAILY_AI_LIMIT, type SubscriptionRow } from '@/lib/subscription';
import { useRevenueCat } from '@/hooks/use-revenuecat';
import { useAuth } from '@/providers/auth-provider';
import { useLocalization } from '@/providers/localization-provider';

type Message = { id: string; role: 'user' | 'assistant'; text: string };
type DictationStatus = 'idle' | 'listening' | 'processing' | 'error';
type SpeechRecognitionModule = {
  abort: () => void;
  addListener: (eventName: string, listener: (event?: SpeechRecognitionEvent) => void) => { remove: () => void };
  isRecognitionAvailable: () => boolean;
  requestPermissionsAsync: () => Promise<{ granted: boolean }>;
  start: (options: {
    continuous: boolean;
    interimResults: boolean;
    iosTaskHint: 'dictation';
    lang: string;
    maxAlternatives: number;
  }) => void;
  stop: () => void;
};
type SpeechRecognitionEvent = {
  error?: string;
  isFinal?: boolean;
  results?: { transcript?: string }[];
};

declare const require: (moduleName: string) => unknown;

let speechRecognitionModule: SpeechRecognitionModule | null | undefined;

type ChatResponse = {
  reply: string;
  threadId: string | null;
  remaining: number;
  dailyLimit: number;
};

/**
 * Server quota codes → localized messages.
 *
 * The Edge Function answers with a machine-readable `code` (`cooldown`, `daily_limit`, `client_limit`,
 * `ip_limit`, `monthly_cap`) and a Romanian sentence. The sentence stays as a FALLBACK for a client that
 * does not know the code yet; everything the app can name is rendered in the user's own language, because
 * "limita de mesaje a fost atinsă" is not an answer for someone reading the app in Georgian.
 */
const QUOTA_MESSAGE_KEYS: Record<string, TranslationKey> = {
  cooldown: 'chat.quotaCooldown',
  daily_limit: 'chat.quotaDailyLimit',
  client_limit: 'chat.quotaClientLimit',
  ip_limit: 'chat.quotaIpLimit',
  monthly_cap: 'chat.quotaMonthlyCap',
};

/**
 * `true` only for the codes that mean "nothing left today".
 *
 * The cooldown is deliberately NOT here: it is temporary, so the remaining count the server sent must be
 * preserved rather than zeroed.
 */
function isQuotaExhausted(code: unknown): boolean {
  return code === 'daily_limit' || code === 'client_limit' || code === 'ip_limit' || code === 'monthly_cap';
}

/** The localized sentence for a server quota code, or `fallback` when the code is unknown/absent. */
function quotaMessage(details: { code?: unknown } | null | undefined, fallback: string, translate: (key: TranslationKey) => string): string {
  const key = typeof details?.code === 'string' ? QUOTA_MESSAGE_KEYS[details.code] : undefined;
  return key === undefined ? fallback : translate(key);
}

/**
 * Client-side ceiling for a chat request.
 *
 * `supabase.functions.invoke` applies a timeout only when one is passed, and the
 * Edge Function's own 30s guard covers the upstream AI call rather than the whole
 * request. Without this the send button could stay disabled forever on a stalled
 * connection.
 */
const CHAT_REQUEST_TIMEOUT_MS = 45_000;

/**
 * L-06: a foreground reload only happens when the app was actually backgrounded
 * for at least this long. Short app switches (checking a notification, sharing
 * a screenshot) keep the conversation already on screen.
 */
const CHAT_FOREGROUND_RELOAD_MIN_ABSENCE_MS = 60_000;

/**
 * L-06: and only when the conversation currently rendered was fetched longer
 * ago than this. Together the two guards turn "reload on every foreground" into
 * "reload when the data could plausibly be stale".
 */
const CHAT_FOREGROUND_RELOAD_MIN_STALENESS_MS = 60_000;

function welcomeMessage(t: (key: TranslationKey) => string): Message {
  return {
    id: 'welcome',
    role: 'assistant',
    text: t('chat.welcome'),
  };
}

function localDateKey() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Bucharest',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) throw new Error('Nu s-a putut determina data quota.');
  return `${year}-${month}-${day}`;
}

function appendDictationText(current: string, transcript: string) {
  const cleanTranscript = transcript.trim();
  if (!cleanTranscript) return current;
  const cleanCurrent = current.trimEnd();
  return cleanCurrent ? `${cleanCurrent} ${cleanTranscript}` : cleanTranscript;
}

function getDictationLocale(languageCode: string, regionLocale: string) {
  return languageCode === 'en' ? 'en-US' : regionLocale;
}

function getSpeechRecognitionModule() {
  if (speechRecognitionModule !== undefined) return speechRecognitionModule;

  try {
    const speechRecognition = require('expo-speech-recognition') as {
      ExpoSpeechRecognitionModule?: SpeechRecognitionModule;
    };
    speechRecognitionModule = speechRecognition.ExpoSpeechRecognitionModule ?? null;
  } catch {
    speechRecognitionModule = null;
  }

  return speechRecognitionModule;
}

export default function ChatScreen() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const { t } = useLocalization();

  // B-07: `user` is null until the persisted session has been restored, so mounting
  // the conversation right away rendered the guest thread and then threw it away when
  // `key={user.id}` changed — a visible flash of the signed-out state, a wasted
  // quota/history fetch and a lost draft. Wait for the restore to settle first.
  if (isAuthLoading) {
    return (
      <Screen style={styles.chatScreen}>
        <View style={styles.loading}>
          <ActivityIndicator color={palette.blue} />
          <Text style={styles.loadingText}>{t('chat.loading')}</Text>
        </View>
      </Screen>
    );
  }

  return <ChatConversation key={user?.id ?? 'guest'} />;
}

function ChatConversation() {
  const { user } = useAuth();
  const { languageCode, region, t } = useLocalization();
  const { priceFor } = useRevenueCat();
  // Localized store price for the monthly plan; null until offerings load.
  const monthlyPrice = priceFor('monthly');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([welcomeMessage(t)]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [dailyLimit, setDailyLimit] = useState(FREE_DAILY_AI_LIMIT);
  const [remaining, setRemaining] = useState(FREE_DAILY_AI_LIMIT);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const isSendingRef = useRef(false);
  const dictationActiveRef = useRef(false);
  const dictationReloadPauseUntilRef = useRef(0);
  const loadRequestRef = useRef(0);
  const sendRequestRef = useRef(0);
  const pendingLoadRef = useRef(false);
  // L-06: foreground-reload bookkeeping.
  const backgroundedAtRef = useRef<number | null>(null);
  const lastLoadCompletedAtRef = useRef(0);
  const quotaDateRef = useRef(localDateKey());
  const [errorMessage, setErrorMessage] = useState('');
  const [dictationStatus, setDictationStatus] = useState<DictationStatus>('idle');
  const [dictationMessage, setDictationMessage] = useState('');

  /**
   * The dictation listener is installed exactly once (empty dependency list below),
   * so it must not close over the current `t`. Without this ref the error copy added
   * by the accessibility pass would be frozen in the language that was active at
   * mount, and the strings were previously Romanian literals — which is exactly the
   * defect being fixed.
   */
  const translateRef = useRef(t);
  useEffect(() => {
    translateRef.current = t;
  }, [t]);

  const pauseDictationReloads = () => {
    dictationReloadPauseUntilRef.current = Date.now() + 3000;
  };

  useEffect(() => {
    const speechRecognition = getSpeechRecognitionModule();
    if (!speechRecognition) return undefined;

    const subscriptions = [
      speechRecognition.addListener('start', () => {
        dictationActiveRef.current = true;
        pauseDictationReloads();
        setDictationStatus('listening');
        setDictationMessage(t('chat.dictationListening'));
      }),
      speechRecognition.addListener('result', (event) => {
        const transcript = event?.results?.[0]?.transcript ?? '';
        if (!event?.isFinal || !transcript.trim()) return;

        setInput((current) => appendDictationText(current, transcript));
        setDictationStatus('processing');
        setDictationMessage(t('chat.dictationAdded'));
      }),
      speechRecognition.addListener('end', () => {
        dictationActiveRef.current = false;
        pauseDictationReloads();
        setDictationStatus('idle');
      }),
      speechRecognition.addListener('error', (event) => {
        dictationActiveRef.current = false;
        pauseDictationReloads();
        if (event?.error === 'aborted' || event?.error === 'no-speech' || event?.error === 'speech-timeout') {
          setDictationStatus('idle');
          // Read through a ref: this effect installs the listener once, so calling
          // `t` directly would capture the first render's language and keep
          // announcing the old locale after the user switches language.
          setDictationMessage(event.error === 'aborted' ? '' : translateRef.current('chat.dictationStoppedNoText'));
          return;
        }

        setDictationStatus('error');
        setDictationMessage(event?.error === 'not-allowed'
          ? translateRef.current('chat.dictationMicrophoneBlocked')
          : translateRef.current('chat.dictationStartFailed'));
      }),
    ];

    return () => {
      subscriptions.forEach((subscription) => subscription.remove());
    };
  }, []);

  const loadConversation = useCallback(async () => {
    if (Date.now() < dictationReloadPauseUntilRef.current) return;
    if (dictationActiveRef.current) return;

    if (isSendingRef.current) {
      pendingLoadRef.current = true;
      return;
    }

    const quotaDate = localDateKey();
    quotaDateRef.current = quotaDate;
    const requestId = ++loadRequestRef.current;
    setIsLoading(true);
    setErrorMessage('');

    if (!user) {
      setMessages([welcomeMessage(t)]);
      setThreadId(null);
      setDailyLimit(FREE_DAILY_AI_LIMIT);
      setRemaining(FREE_DAILY_AI_LIMIT);
      setIsLoading(false);
      lastLoadCompletedAtRef.current = Date.now();
      return;
    }

    const [usageResult, threadResult, subscriptionResult] = await Promise.all([
      supabase
        .from('usage_daily')
        .select('ai_messages')
        .eq('user_id', user.id)
        .eq('usage_date', quotaDate)
        .maybeSingle(),
      supabase
        .from('chat_threads')
        .select('id')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('subscriptions')
        .select('status, plan, current_period_end, cancel_at_period_end')
        .eq('user_id', user.id)
        .maybeSingle(),
    ]);

    if (loadRequestRef.current !== requestId) return;

    if (usageResult.error || threadResult.error || subscriptionResult.error) {
      setErrorMessage(t('chat.loadError'));
      setIsLoading(false);
      return;
    }

    const nextLimit = hasPremiumAccess(subscriptionResult.data as SubscriptionRow | null)
      ? PREMIUM_DAILY_AI_LIMIT
      : FREE_DAILY_AI_LIMIT;
    setDailyLimit(nextLimit);
    setRemaining(Math.max(0, nextLimit - (usageResult.data?.ai_messages ?? 0)));

    const latestThreadId = threadResult.data?.id ?? null;
    setThreadId(latestThreadId);

    if (latestThreadId) {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('id, role, content')
        .eq('thread_id', latestThreadId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (loadRequestRef.current !== requestId) return;

      if (error) {
        setErrorMessage(t('chat.oldMessagesLoadError'));
      } else if (data && data.length > 0) {
        setMessages([...data].reverse().map((message) => ({
          id: message.id,
          role: message.role as Message['role'],
          text: message.content,
        })));
      } else {
        setMessages([welcomeMessage(t)]);
      }
    } else {
      setMessages([welcomeMessage(t)]);
    }

    setIsLoading(false);
    lastLoadCompletedAtRef.current = Date.now();
  }, [t, user]);

  useFocusEffect(
    useCallback(() => {
      const timeoutId = setTimeout(() => void loadConversation(), 0);
      return () => {
        clearTimeout(timeoutId);
        loadRequestRef.current += 1;
      };
    }, [loadConversation]),
  );

  // L-06: reloading on every foreground transition burned a chat_threads,
  // usage_daily, subscriptions and chat_messages round-trip each time the user
  // merely glanced at a notification and came back. Reload only when the app
  // was genuinely away for a while AND the rendered conversation is stale;
  // every other foreground transition keeps the data already on screen.
  useEffect(() => {
    if (Platform.OS === 'web') return undefined;

    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        backgroundedAtRef.current = Date.now();
        return;
      }
      const backgroundedAt = backgroundedAtRef.current;
      backgroundedAtRef.current = null;
      if (dictationActiveRef.current) return;
      if (Date.now() < dictationReloadPauseUntilRef.current) return;
      if (backgroundedAt === null) return;
      if (Date.now() - backgroundedAt < CHAT_FOREGROUND_RELOAD_MIN_ABSENCE_MS) return;
      if (Date.now() - lastLoadCompletedAtRef.current < CHAT_FOREGROUND_RELOAD_MIN_STALENESS_MS) return;
      void loadConversation();
    });

    return () => subscription.remove();
  }, [loadConversation]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      const currentQuotaDate = localDateKey();
      if (currentQuotaDate === quotaDateRef.current) return;
      if (dictationActiveRef.current) return;
      void loadConversation();
    }, 60_000);

    return () => clearInterval(intervalId);
  }, [loadConversation]);

  useEffect(() => () => {
    sendRequestRef.current += 1;
    getSpeechRecognitionModule()?.abort();
  }, []);

  const toggleDictation = async () => {
    const speechRecognition = getSpeechRecognitionModule();
    if (!speechRecognition) {
      dictationActiveRef.current = false;
      setDictationStatus('error');
      setDictationMessage(t('chat.dictationRebuildRequired'));
      return;
    }

    if (dictationStatus === 'listening') {
      setDictationStatus('processing');
      setDictationMessage(t('chat.dictationProcessing'));
      pauseDictationReloads();
      speechRecognition.stop();
      return;
    }

    if (dictationStatus === 'processing') return;

    try {
      dictationActiveRef.current = true;
      pauseDictationReloads();
      setDictationStatus('processing');
      setDictationMessage(t('chat.dictationPreparing'));

      if (!speechRecognition.isRecognitionAvailable()) {
        dictationActiveRef.current = false;
        setDictationStatus('error');
        setDictationMessage(t('chat.dictationUnavailable'));
        return;
      }

      const permission = await speechRecognition.requestPermissionsAsync();
      if (!permission.granted) {
        dictationActiveRef.current = false;
        setDictationStatus('error');
        setDictationMessage(t('chat.dictationPermissionRequired'));
        return;
      }

      setDictationMessage(t('chat.dictationStartPrompt'));
      speechRecognition.start({
        lang: getDictationLocale(languageCode, region.locale),
        interimResults: false,
        maxAlternatives: 1,
        continuous: false,
        iosTaskHint: 'dictation',
      });
    } catch {
      dictationActiveRef.current = false;
      setDictationStatus('error');
      setDictationMessage(t('chat.dictationFailed'));
    }
  };

  useEffect(() => {
    if (isSending || !pendingLoadRef.current) return;

    pendingLoadRef.current = false;
    const timeoutId = setTimeout(() => void loadConversation(), 0);
    return () => clearTimeout(timeoutId);
  }, [isSending, loadConversation]);

  const send = async () => {
    if (isSendingRef.current) return;
    if (isLoading) return;
    const clean = input.trim();
    if (!clean) return;

    if (remaining <= 0) {
      setErrorMessage(t('chat.freeLimitReached').replace('{count}', String(dailyLimit)));
      return;
    }

    if (clean.length > 1200) {
      setErrorMessage(t('chat.maxLengthError'));
      return;
    }

    loadRequestRef.current += 1;
    const requestId = ++sendRequestRef.current;
    const isCurrentRequest = () => sendRequestRef.current === requestId;

    const optimisticId = `local-${Date.now()}`;
    setMessages((current) => [...current, { id: optimisticId, role: 'user', text: clean }]);
    setInput('');
    setErrorMessage('');

    isSendingRef.current = true;
    setIsSending(true);

    try {
      if (!user) await ensureGuestChatSession();
      const chatClient = user ? supabase : chatGuestSupabase;
      if (!isCurrentRequest()) return;

      const { data, error } = await chatClient.functions.invoke<ChatResponse>('orthodox-chat', {
        body: { message: clean, threadId },
        // The server enforces its free-tier brakes on a salted hash of (this identifier + the
        // client address). Without the header only the IP brake applies, which is why the value
        // is sent on every request even though the server never trusts it on its own.
        headers: { 'x-device-id': await getAiLimitDeviceId() },
        // Without an explicit timeout the request can hang indefinitely while the
        // composer stays disabled, leaving the user with no way to recover except
        // restarting the app. The Edge Function bounds its own upstream AI call to
        // 30s, so 45s covers a cold start plus the AI round trip.
        timeout: CHAT_REQUEST_TIMEOUT_MS,
      });

      if (!isCurrentRequest()) return;

      if (error || !data?.reply) {
        let message = t('chat.aiResponseError');
        if (error instanceof FunctionsHttpError) {
          try {
            const details = await error.context.json();
            if (!isCurrentRequest()) return;
            message = quotaMessage(details, typeof details?.error === 'string' ? details.error : message, t);
            if (typeof details?.remaining === 'number') setRemaining(details.remaining);
            if (typeof details?.dailyLimit === 'number') setDailyLimit(details.dailyLimit);
            if (isQuotaExhausted(details?.code)) setRemaining(0);
          } catch {
            // PÃ„Æ’strÃ„Æ’m mesajul simplu de mai sus.
          }
        }

        if (!isCurrentRequest()) return;
        setErrorMessage(message);
        setMessages((current) => current.filter((m) => m.id !== optimisticId));
        setInput(clean);
        return;
      }

      setThreadId(data.threadId);
      setDailyLimit(data.dailyLimit);
      setRemaining(data.remaining);
      setMessages((current) => [...current, {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        text: data.reply,
      }]);
    } catch {
      if (isCurrentRequest()) {
        setErrorMessage(t('chat.serviceUnavailableError'));
        setMessages((current) => current.filter((m) => m.id !== optimisticId));
        setInput(clean);
      }
    } finally {
      if (isCurrentRequest()) {
        isSendingRef.current = false;
        setIsSending(false);
      }
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen style={styles.chatScreen}>
        <PageHeader eyebrow={t('chat.eyebrow')} title={t('chat.title')} subtitle={t('chat.subtitle')} />
        <Card style={styles.limitCard}>
          {/* Plural-aware: a remaining count of 1 needs the singular noun/verb in
              ro/ru/sr/uk ("un mesaj rămas", not "1 de mesaje rămase"). */}
          <Text style={styles.limit}>{user
            ? translatePlural(languageCode, 'chat.premiumLimitLabel', remaining, {
              plan: dailyLimit === PREMIUM_DAILY_AI_LIMIT ? t('chat.planPremium') : t('chat.planFree'),
              count: remaining,
              limit: dailyLimit,
            })
            : translatePlural(languageCode, 'chat.freeLimitLabel', remaining, {
              count: remaining,
              limit: dailyLimit,
            })}</Text>
        </Card>
        {remaining <= 0 ? (
          <Card style={styles.errorCard}>
            <Text style={styles.errorText}>{t('chat.noMessagesLeft').replace('{limit}', String(dailyLimit))}</Text>
            {/* The price comes from the store (RevenueCat priceString) in the user's
                own currency. It used to be hardcoded as "9,99 lei", which was wrong
                for every locale whose store currency is not RON. */}
            <Text style={styles.premiumOffer}>
              {t('chat.premiumOffer').replace('{price}', monthlyPrice ?? t('premium.priceInStore'))}
            </Text>
            <PrimaryButton label={t('chat.choosePremiumButton')} onPress={() => router.push('/premium')} />
            <Pressable accessibilityRole="button" disabled={isLoading} onPress={() => void loadConversation()}>
              <Text style={styles.retry}>{t('chat.retry')}</Text>
            </Pressable>
          </Card>
        ) : errorMessage ? (
          <Card style={styles.errorCard}>
            <Text style={styles.errorText}>{errorMessage}</Text>
            <Pressable accessibilityRole="button" onPress={() => void loadConversation()}>
              <Text style={styles.retry}>{t('chat.retry')}</Text>
            </Pressable>
          </Card>
        ) : null}
        {isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={palette.blue} />
            <Text style={styles.loadingText}>{t('chat.loading')}</Text>
          </View>
        ) : (
          <View style={styles.messages}>
            {messages.map((message) => (
              <View key={message.id} style={[styles.message, message.role === 'user' ? styles.userMessage : styles.assistantMessage]}>
                <Text style={message.role === 'user' ? styles.userText : styles.assistantText}>{message.text}</Text>
              </View>
            ))}
            {isSending ? (
              <View style={[styles.message, styles.assistantMessage, styles.thinking]}>
                <ActivityIndicator size="small" color={palette.blue} />
                <Text style={styles.assistantText}>{t('chat.thinking')}</Text>
              </View>
            ) : null}
          </View>
        )}
        <View style={styles.composer}>
          <TextInput
            accessibilityLabel={t('chat.inputPlaceholder')}
            value={input}
            onChangeText={setInput}
            placeholder={t('chat.inputPlaceholder')}
            placeholderTextColor={palette.muted}
            multiline
            editable={!isSending && !isLoading}
            maxLength={1200}
            style={styles.input}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={dictationStatus === 'listening' ? t('chat.dictationStopAccessibility') : t('chat.dictationStartAccessibility')}
            disabled={isSending || isLoading || dictationStatus === 'processing'}
            onPress={() => void toggleDictation()}
            style={[
              styles.mic,
              dictationStatus === 'listening' && styles.micListening,
              dictationStatus === 'error' && styles.micError,
              (isSending || isLoading || dictationStatus === 'processing') && styles.disabled,
            ]}
          >
            <SymbolView
              name={{ ios: dictationStatus === 'listening' ? 'mic.fill' : 'mic', android: 'mic', web: 'mic' }}
              size={22}
              tintColor={dictationStatus === 'listening' ? palette.blue : palette.ink}
              fallback={<Text style={styles.micFallback}>Mic</Text>}
            />
          </Pressable>
          <Pressable accessibilityRole="button" disabled={isSending || isLoading} onPress={() => void send()} style={[styles.send, (isSending || isLoading) && styles.disabled]}>
            <Text style={styles.sendText}>{t('chat.sendButton')}</Text>
          </Pressable>
        </View>
        <Text
          accessibilityLiveRegion="polite"
          style={[
            styles.dictationMessage,
            dictationStatus === 'listening' && styles.dictationListeningText,
            dictationStatus === 'error' && styles.dictationErrorText,
          ]}
        >
          {dictationMessage || ' '}
        </Text>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  limitCard: { backgroundColor: palette.blueSoft, paddingVertical: 12 },
  limit: { color: palette.blue, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  messages: { gap: 10 },
  chatScreen: { backgroundColor: palette.skyLight },
  message: { maxWidth: '88%', paddingHorizontal: 15, paddingVertical: 12, borderRadius: 16 },
  userMessage: { backgroundColor: palette.blue, alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  assistantMessage: { backgroundColor: palette.skyLight, borderColor: palette.border, borderWidth: 1, alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  thinking: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  userText: { color: '#FFFFFF', fontSize: 15, lineHeight: 21 },
  assistantText: { color: palette.ink, fontSize: 15, lineHeight: 21 },
  composer: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  input: { flex: 1, minHeight: 48, maxHeight: 120, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line, borderRadius: 14, color: palette.ink, paddingHorizontal: 14, paddingVertical: 12 },
  mic: { width: 48, height: 48, borderRadius: 14, backgroundColor: palette.paper, borderColor: palette.line, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  micListening: { backgroundColor: palette.blueSoft, borderColor: palette.blue },
  micError: { borderColor: palette.danger },
  micFallback: { color: palette.ink, fontSize: 11, fontWeight: '800' },
  send: { minHeight: 48, paddingHorizontal: 16, borderRadius: 14, backgroundColor: palette.gold, alignItems: 'center', justifyContent: 'center' },
  sendText: { color: palette.ink, fontWeight: '800' },
  dictationMessage: { color: palette.muted, fontSize: 12, lineHeight: 17, marginTop: -2 },
  dictationListeningText: { color: palette.blue, fontWeight: '700' },
  dictationErrorText: { color: palette.danger },
  disabled: { opacity: 0.55 },
  loading: { alignItems: 'center', gap: 8, paddingVertical: 30 },
  loadingText: { color: palette.muted, fontSize: 14 },
  errorCard: { borderColor: palette.danger },
  errorText: { color: palette.danger, fontSize: 14, lineHeight: 20 },
  premiumOffer: { color: palette.ink, fontSize: 14, fontWeight: '700', lineHeight: 20, textAlign: 'center' },
  retry: { color: palette.blue, fontWeight: '800' },
});
