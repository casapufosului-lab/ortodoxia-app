import { FunctionsHttpError } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Card, PageHeader, PrimaryButton, Screen } from '@/components/mvp-ui';
import { palette } from '@/constants/palette';
import { supabase } from '@/lib/supabase';
import { FREE_DAILY_AI_LIMIT, hasPremiumAccess, PREMIUM_DAILY_AI_LIMIT, type SubscriptionRow } from '@/lib/subscription';
import { useAuth } from '@/providers/auth-provider';

type Message = { id: string; role: 'user' | 'assistant'; text: string };

type ChatResponse = {
  reply: string;
  threadId: string | null;
  remaining: number;
  dailyLimit: number;
};

const welcomeMessage: Message = {
  id: 'welcome',
  role: 'assistant',
  text: 'Bine ai venit. Poți întreba despre rugăciune, sărbători sau termeni din credința ortodoxă.',
};

const GUEST_ID_STORAGE_KEY = 'orthodox_guest_id';

function createGuestId() {
  return `guest-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}

function localDateKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function ChatScreen() {
  const { user } = useAuth();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([welcomeMessage]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [dailyLimit, setDailyLimit] = useState(FREE_DAILY_AI_LIMIT);
  const [remaining, setRemaining] = useState(FREE_DAILY_AI_LIMIT);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const ensureGuestId = useCallback(async () => {
    const storedId = await AsyncStorage.getItem(GUEST_ID_STORAGE_KEY);
    if (storedId) {
      return storedId;
    }

    const nextId = createGuestId();
    await AsyncStorage.setItem(GUEST_ID_STORAGE_KEY, nextId);
    return nextId;
  }, []);

  const loadConversation = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');

    if (!user) {
      setMessages([welcomeMessage]);
      setThreadId(null);
      setDailyLimit(FREE_DAILY_AI_LIMIT);
      setRemaining(FREE_DAILY_AI_LIMIT);
      void ensureGuestId();
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

    if (usageResult.error || threadResult.error || subscriptionResult.error) {
      setErrorMessage('Conversația nu a putut fi încărcată. Încearcă din nou.');
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
        .order('created_at', { ascending: true })
        .limit(50);

      if (error) {
        setErrorMessage('Mesajele vechi nu au putut fi încărcate.');
      } else if (data && data.length > 0) {
        setMessages(data.map((message) => ({
          id: message.id,
          role: message.role as Message['role'],
          text: message.content,
        })));
      } else {
        setMessages([welcomeMessage]);
      }
    } else {
      setMessages([welcomeMessage]);
    }

    setIsLoading(false);
  }, [ensureGuestId, user]);

  useEffect(() => {
    const timeoutId = setTimeout(() => void loadConversation(), 0);
    return () => clearTimeout(timeoutId);
  }, [loadConversation]);

  const send = async () => {
    const clean = input.trim();
    if (!clean || isSending) return;

    if (remaining <= 0) {
      setErrorMessage(`Ai folosit cele ${dailyLimit} de întrebări gratuite disponibile azi. Creează un cont pentru a continua.`);
      return;
    }

    if (clean.length > 1200) {
      setErrorMessage('Întrebarea poate avea cel mult 1.200 de caractere.');
      return;
    }

    const optimisticId = `local-${Date.now()}`;
    setMessages((current) => [...current, { id: optimisticId, role: 'user', text: clean }]);
    setInput('');
    setErrorMessage('');
    setIsSending(true);

    const currentGuestId = user ? null : await ensureGuestId();

    const { data, error } = await supabase.functions.invoke<ChatResponse>('orthodox-chat', {
      body: { message: clean, threadId, guestId: currentGuestId },
    });

    if (error || !data?.reply) {
      let message = 'Răspunsul AI nu a putut fi generat. Încearcă din nou.';
      if (error instanceof FunctionsHttpError) {
        try {
          const details = await error.context.json();
          if (typeof details?.error === 'string') message = details.error;
          if (typeof details?.remaining === 'number') setRemaining(details.remaining);
          if (typeof details?.dailyLimit === 'number') setDailyLimit(details.dailyLimit);
          if (error.context.status === 429 || message.includes('Ai folosit')) setRemaining(0);
        } catch {
          // Păstrăm mesajul simplu de mai sus.
        }
      }
      setErrorMessage(message);
      setIsSending(false);
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
    setIsSending(false);
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <PageHeader eyebrow="Ghid informativ" title="Întreabă" subtitle="Răspunsurile AI pot greși și nu înlocuiesc sfatul preotului duhovnic." />
        <Card style={styles.limitCard}>
          <Text style={styles.limit}>{user ? `${dailyLimit === PREMIUM_DAILY_AI_LIMIT ? 'Plan Premium' : 'Plan gratuit'}: ${remaining} din ${dailyLimit} mesaje rămase azi` : `${remaining} din ${dailyLimit} întrebări gratuite rămase azi`}</Text>
        </Card>
        {remaining <= 0 ? (
          <Card style={styles.errorCard}>
            <Text style={styles.errorText}>Ai folosit toate cele {dailyLimit} mesaje disponibile azi.</Text>
            <Text style={styles.premiumOffer}>Pentru a continua conversația, alege planul Premium, 9,99 lei/lună.</Text>
            <PrimaryButton label="Alege planul Premium" onPress={() => router.push('/premium')} />
          </Card>
        ) : errorMessage ? (
          <Card style={styles.errorCard}>
            <Text style={styles.errorText}>{errorMessage}</Text>
            <Pressable accessibilityRole="button" onPress={() => void loadConversation()}>
              <Text style={styles.retry}>Reîncarcă conversația</Text>
            </Pressable>
          </Card>
        ) : null}
        {isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={palette.blue} />
            <Text style={styles.loadingText}>Se încarcă conversația...</Text>
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
                <Text style={styles.assistantText}>Pregătesc răspunsul...</Text>
              </View>
            ) : null}
          </View>
        )}
        <View style={styles.composer}>
          <TextInput
            accessibilityLabel="Scrie întrebarea ta"
            value={input}
            onChangeText={setInput}
            placeholder="Scrie întrebarea ta"
            placeholderTextColor={palette.muted}
            multiline
            editable={!isSending}
            maxLength={1200}
            style={styles.input}
          />
          <Pressable accessibilityRole="button" disabled={isSending} onPress={() => void send()} style={[styles.send, isSending && styles.disabled]}>
            <Text style={styles.sendText}>Trimite</Text>
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
