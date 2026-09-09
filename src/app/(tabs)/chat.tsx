import { FunctionsHttpError } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Card, PageHeader, PrimaryButton, Screen } from '@/components/mvp-ui';
import { palette } from '@/constants/palette';
import { type TranslationKey } from '@/i18n/config';
import { chatGuestSupabase, ensureGuestChatSession, supabase } from '@/lib/supabase';
import { FREE_DAILY_AI_LIMIT, hasPremiumAccess, PREMIUM_DAILY_AI_LIMIT, type SubscriptionRow } from '@/lib/subscription';
import { useAuth } from '@/providers/auth-provider';
import { useLocalization } from '@/providers/localization-provider';

type Message = { id: string; role: 'user' | 'assistant'; text: string };

type ChatResponse = {
  reply: string;
  threadId: string | null;
  remaining: number;
  dailyLimit: number;
};

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

export default function ChatScreen() {
  const { user } = useAuth();
  return <ChatConversation key={user?.id ?? 'guest'} />;
}

function ChatConversation() {
  const { user } = useAuth();
  const { t } = useLocalization();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([welcomeMessage(t)]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [dailyLimit, setDailyLimit] = useState(FREE_DAILY_AI_LIMIT);
  const [remaining, setRemaining] = useState(FREE_DAILY_AI_LIMIT);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const isSendingRef = useRef(false);
  const loadRequestRef = useRef(0);
  const sendRequestRef = useRef(0);
  const [errorMessage, setErrorMessage] = useState('');

  const loadConversation = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setIsLoading(true);
    setErrorMessage('');

    if (!user) {
      setMessages([welcomeMessage(t)]);
      setThreadId(null);
      setDailyLimit(FREE_DAILY_AI_LIMIT);
      setRemaining(FREE_DAILY_AI_LIMIT);
      setIsLoading(false);
      return;
    }

    const [usageResult, threadResult, subscriptionResult] = await Promise.all([
      supabase
        .from('usage_daily')
        .select('ai_messages')
        .eq('user_id', user.id)
        .eq('usage_date', localDateKey())
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
  }, [t, user]);

  useEffect(() => {
    const timeoutId = setTimeout(() => void loadConversation(), 0);
    return () => {
      clearTimeout(timeoutId);
      loadRequestRef.current += 1;
    };
  }, [loadConversation]);

  useEffect(() => () => {
    sendRequestRef.current += 1;
  }, []);

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
      });

      if (!isCurrentRequest()) return;

      if (error || !data?.reply) {
        let message = t('chat.aiResponseError');
        if (error instanceof FunctionsHttpError) {
          try {
            const details = await error.context.json();
            if (!isCurrentRequest()) return;
            if (typeof details?.error === 'string') message = details.error;
            if (typeof details?.remaining === 'number') setRemaining(details.remaining);
            if (typeof details?.dailyLimit === 'number') setDailyLimit(details.dailyLimit);
            if (details?.code === 'daily_limit') setRemaining(0);
            // Cooldown is temporary: preserve the server-provided remaining quota.
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
      <Screen>
        <PageHeader eyebrow={t('chat.eyebrow')} title={t('chat.title')} subtitle={t('chat.subtitle')} />
        <Card style={styles.limitCard}>
          <Text style={styles.limit}>{user ? t('chat.premiumLimitLabel')
            .replace('{plan}', dailyLimit === PREMIUM_DAILY_AI_LIMIT ? t('chat.planPremium') : t('chat.planFree'))
            .replace('{count}', String(remaining))
            .replace('{limit}', String(dailyLimit))
            : t('chat.freeLimitLabel')
              .replace('{count}', String(remaining))
              .replace('{limit}', String(dailyLimit))}</Text>
        </Card>
        {remaining <= 0 ? (
          <Card style={styles.errorCard}>
            <Text style={styles.errorText}>{t('chat.noMessagesLeft').replace('{limit}', String(dailyLimit))}</Text>
            <Text style={styles.premiumOffer}>{t('chat.premiumOffer')}</Text>
            <PrimaryButton label={t('chat.choosePremiumButton')} onPress={() => router.push('/premium')} />
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
          <Pressable accessibilityRole="button" disabled={isSending || isLoading} onPress={() => void send()} style={[styles.send, (isSending || isLoading) && styles.disabled]}>
            <Text style={styles.sendText}>{t('chat.sendButton')}</Text>
          </Pressable>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  limitCard: { backgroundColor: palette.blueSoft, paddingVertical: 12 },
  limit: { color: palette.blue, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  messages: { gap: 10 },
  message: { maxWidth: '88%', paddingHorizontal: 15, paddingVertical: 12, borderRadius: 16 },
  userMessage: { backgroundColor: palette.blue, alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  assistantMessage: { backgroundColor: palette.paper, borderColor: palette.line, borderWidth: 1, alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  thinking: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  userText: { color: '#FFFFFF', fontSize: 15, lineHeight: 21 },
  assistantText: { color: palette.ink, fontSize: 15, lineHeight: 21 },
  composer: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  input: { flex: 1, minHeight: 48, maxHeight: 120, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line, borderRadius: 14, color: palette.ink, paddingHorizontal: 14, paddingVertical: 12 },
  send: { minHeight: 48, paddingHorizontal: 16, borderRadius: 14, backgroundColor: palette.goldDark, alignItems: 'center', justifyContent: 'center' },
  sendText: { color: '#FFFFFF', fontWeight: '800' },
  disabled: { opacity: 0.55 },
  loading: { alignItems: 'center', gap: 8, paddingVertical: 30 },
  loadingText: { color: palette.muted, fontSize: 14 },
  errorCard: { borderColor: palette.danger },
  errorText: { color: palette.danger, fontSize: 14, lineHeight: 20 },
  premiumOffer: { color: palette.ink, fontSize: 14, fontWeight: '700', lineHeight: 20, textAlign: 'center' },
  retry: { color: palette.blue, fontWeight: '800' },
});
