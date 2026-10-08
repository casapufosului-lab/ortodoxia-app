import { useFocusEffect, router } from 'expo-router';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Card, PageHeader, PrimaryButton, Screen } from '@/components/mvp-ui';
import { palette } from '@/constants/palette';
import { displayableSource } from '@/lib/content-source';
import { useLocalization } from '@/providers/localization-provider';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

type Prayer = {
  id: string;
  category: string;
  title: string;
  body: string;
  editorial_source: string | null;
  audio_path: string | null;
};

/**
 * C-09: lifetime of the signed URL issued for a prayer recording.
 *
 * A prayer recording runs at most a few minutes; five minutes is long enough for a
 * full listen plus a retry, and short enough that a leaked URL expires quickly.
 */
const PRAYER_AUDIO_SIGNED_URL_TTL_SECONDS = 300;

function normalizeSearchText(value: string, locale: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase(locale)
    .trim();
}

export default function PrayersScreen() {
  const { user } = useAuth();
  const { t, region, languageCode } = useLocalization();
  const [query, setQuery] = useState('');
  const [prayers, setPrayers] = useState<Prayer[]>([]);
  // J-04: true when the selected language has no prayers yet and the rows shown
  // come from the untranslated corpus.
  const [untranslatedFallback, setUntranslatedFallback] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const audioPlayerRef = useRef<AudioPlayer | null>(null);
  const audioStartingRef = useRef(false);
  const speechRequestRef = useRef(0);
  const loadRequestRef = useRef(0);
  const favoriteBusyRef = useRef(new Set<string>());

  const loadPrayers = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setIsLoading(true);
    setErrorMessage('');

    try {
      // J-04: the query had no language filter at all, so a Greek or Georgian
      // user saw the Romanian corpus. Ask for the selected language first and
      // only fall back to the unfiltered (all-language) result when the prayers
      // corpus has not been translated yet — the same two-step pattern the home
      // screen uses for daily_content. The fallback is surfaced to the user
      // instead of being silently presented as localized content.
      const selectColumns = 'id, category, title, body, editorial_source, audio_path';
      let { data, error } = await supabase
        .from('prayers')
        .select(selectColumns)
        .eq('is_published', true)
        .eq('language_code', languageCode)
        .order('sort_order', { ascending: true });

      let fellBackToOtherLanguage = false;
      if (!error && (data ?? []).length === 0) {
        const fallback = await supabase
          .from('prayers')
          .select(selectColumns)
          .eq('is_published', true)
          .order('sort_order', { ascending: true });
        data = fallback.data;
        error = fallback.error;
        fellBackToOtherLanguage = !fallback.error && (fallback.data ?? []).length > 0;
      }

      if (error) {
        if (loadRequestRef.current !== requestId) return;
        setErrorMessage(t('prayers.loadError'));
        return;
      }

      if (loadRequestRef.current !== requestId) return;
      setPrayers(data ?? []);
      setUntranslatedFallback(fellBackToOtherLanguage);

      if (user) {
        const { data: favorites, error: favoritesError } = await supabase
          .from('favorites')
          .select('prayer_id')
          .eq('user_id', user.id);

        if (favoritesError) {
          if (loadRequestRef.current !== requestId) return;
          setErrorMessage(t('prayers.favoritesError'));
        } else {
          if (loadRequestRef.current !== requestId) return;
          setFavoriteIds((favorites ?? []).map((favorite) => favorite.prayer_id));
        }
      } else {
        if (loadRequestRef.current !== requestId) return;
        setFavoriteIds([]);
      }
    } catch {
      if (loadRequestRef.current !== requestId) return;
      setErrorMessage(t('prayers.loadError'));
    } finally {
      if (loadRequestRef.current === requestId) {
        setIsLoading(false);
      }
    }
  }, [languageCode, t, user]);

  useEffect(() => {
    const timeoutId = setTimeout(() => void loadPrayers(), 0);
    return () => clearTimeout(timeoutId);
  }, [loadPrayers]);

  useEffect(() => () => {
    loadRequestRef.current += 1;
    speechRequestRef.current += 1;
    void Speech.stop();
    audioPlayerRef.current?.release();
    audioPlayerRef.current = null;
  }, []);

  // Oprește audio-ul când utilizatorul părăsește tabul Rugăciuni.
  // Tab-urile Expo Router rămân montate, deci unmount-ul clasic nu se declanșează.
  useFocusEffect(
    useCallback(() => {
      return () => {
        speechRequestRef.current += 1;
        void Speech.stop();
        audioPlayerRef.current?.pause();
        audioPlayerRef.current?.release();
        audioPlayerRef.current = null;
        setSpeakingId(null);
      };
    }, []),
  );

  const filtered = useMemo(() => {
    const normalizedQuery = normalizeSearchText(query, region.locale);
    if (!normalizedQuery) return prayers;
    return prayers.filter((prayer) =>
      normalizeSearchText(`${prayer.title} ${prayer.category} ${prayer.body}`, region.locale).includes(normalizedQuery),
    );
  }, [prayers, query, region.locale]);

  const toggleFavorite = async (prayerId: string) => {
    if (!user) {
      router.push('/auth');
      return;
    }

    if (favoriteBusyRef.current.has(prayerId)) return;
    favoriteBusyRef.current.add(prayerId);

    const wasFavorite = favoriteIds.includes(prayerId);
    setFavoriteIds((ids) => wasFavorite ? ids.filter((id) => id !== prayerId) : [...ids, prayerId]);

    try {
      const result = wasFavorite
        ? await supabase.from('favorites').delete().eq('user_id', user.id).eq('prayer_id', prayerId)
        : await supabase.from('favorites').insert({ user_id: user.id, prayer_id: prayerId });

      if (result.error) throw result.error;
      setErrorMessage('');
    } catch {
      setFavoriteIds((ids) => wasFavorite
        ? (ids.includes(prayerId) ? ids : [...ids, prayerId])
        : ids.filter((id) => id !== prayerId));
      setErrorMessage(t('prayers.favoriteError'));
    } finally {
      favoriteBusyRef.current.delete(prayerId);
    }
  };

  const toggleAudio = async (prayer: Prayer) => {
    if (speakingId === prayer.id) {
      await Speech.stop();
      audioPlayerRef.current?.pause();
      audioPlayerRef.current?.release();
      audioPlayerRef.current = null;
      setSpeakingId(null);
      return;
    }

    if (audioStartingRef.current) return;

    audioStartingRef.current = true;
    speechRequestRef.current += 1;
    const speechRequestId = speechRequestRef.current;
    try {
      await Speech.stop();
      if (speechRequestRef.current !== speechRequestId) return;
      audioPlayerRef.current?.pause();
      audioPlayerRef.current?.release();
      audioPlayerRef.current = null;
      setSpeakingId(prayer.id);

      if (prayer.audio_path) {
        // C-09: the bucket is private, so the player must use a short-lived signed
        // URL. getPublicUrl() pointed at a permanently readable object and would
        // return a URL that no longer resolves.
        const { data, error } = await supabase.storage
          .from('prayer-audio')
          .createSignedUrl(prayer.audio_path, PRAYER_AUDIO_SIGNED_URL_TTL_SECONDS);
        if (speechRequestRef.current !== speechRequestId) return;
        if (error || !data?.signedUrl) {
          setSpeakingId(null);
          setErrorMessage(t('prayers.audioStartError'));
          return;
        }
        const player = createAudioPlayer(data.signedUrl, { updateInterval: 250 });
        audioPlayerRef.current = player;
        player.addListener('playbackStatusUpdate', (status) => {
          if (audioPlayerRef.current !== player) return;
          if (status.error) {
            player.release();
            audioPlayerRef.current = null;
            setSpeakingId((currentId) => currentId === prayer.id ? null : currentId);
            setErrorMessage(t('prayers.audioStartError'));
            return;
          }
          if (!status.didJustFinish) return;
          player.release();
          audioPlayerRef.current = null;
          setSpeakingId((currentId) => currentId === prayer.id ? null : currentId);
        });
        player.play();
        return;
      }

      Speech.speak(`${prayer.title}. ${prayer.body}`, {
        language: region.locale,
        rate: 0.85,
        onDone: () => {
          if (speechRequestRef.current !== speechRequestId) return;
          setSpeakingId(null);
        },
        onStopped: () => {
          if (speechRequestRef.current !== speechRequestId) return;
          setSpeakingId(null);
        },
        onError: () => {
          if (speechRequestRef.current !== speechRequestId) return;
          setSpeakingId(null);
          setErrorMessage(t('prayers.audioUnavailableError'));
        },
      });
    } catch {
      audioPlayerRef.current?.release();
      audioPlayerRef.current = null;
      setSpeakingId(null);
      setErrorMessage(t('prayers.audioStartError'));
    } finally {
      audioStartingRef.current = false;
    }
  };

  return (
    <Screen>
      <PageHeader eyebrow={t('prayers.eyebrow')} title={t('nav.prayers')} subtitle={t('prayers.subtitle')} />
      <Text style={styles.aiVoiceNotice}>{t('prayers.aiVoiceNotice')}</Text>
      {untranslatedFallback ? (
        <Text accessibilityLiveRegion="polite" style={styles.untranslatedNotice}>
          {t('prayers.untranslatedNotice')}
        </Text>
      ) : null}
      <TextInput accessibilityLabel={t('prayers.search')} placeholder={t('prayers.search')} placeholderTextColor={palette.muted} value={query} onChangeText={setQuery} style={styles.search} />
      <Text style={styles.searchHint}>{t('prayers.searchHint')}</Text>
      {errorMessage ? (
        <Card style={styles.errorCard}>
          <Text style={styles.errorText}>{errorMessage}</Text>
          <Pressable accessibilityRole="button" onPress={() => void loadPrayers()}>
            <Text style={styles.retry}>{t('common.retry')}</Text>
          </Pressable>
        </Card>
      ) : null}
      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={palette.blue} />
          <Text style={styles.empty}>{t('prayers.loading')}</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {filtered.map((prayer) => {
            const isExpanded = expandedId === prayer.id;
            const isFavorite = favoriteIds.includes(prayer.id);
            const preview = prayer.body.length > 125 ? `${prayer.body.slice(0, 125).trim()}…` : prayer.body;

            return (
              <Card key={prayer.id}>
                <View style={styles.row}>
                  <View style={styles.copy}>
                    <Text style={styles.category}>{prayer.category}</Text>
                    <Text style={styles.title}>{prayer.title}</Text>
                    <Text style={styles.preview}>{isExpanded ? prayer.body : preview}</Text>
                    {isExpanded && displayableSource(prayer.editorial_source) ? (
                      <Text style={styles.source}>{displayableSource(prayer.editorial_source)}</Text>
                    ) : null}
                    <Pressable accessibilityRole="button" onPress={() => setExpandedId(isExpanded ? null : prayer.id)}>
                      <Text style={styles.readButton}>{isExpanded ? t('prayers.close') : t('prayers.read')}</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel={speakingId === prayer.id ? `${t('prayers.audioStopAccessibility')} ${prayer.title}` : `${t('prayers.audioPlayAccessibility')} ${prayer.title}`} onPress={() => void toggleAudio(prayer)}>
                      <Text style={styles.audioButton}>{speakingId === prayer.id ? t('prayers.audioStop') : t('prayers.audioPlay')}</Text>
                    </Pressable>
                  </View>
                  <Pressable accessibilityRole="button" accessibilityLabel={isFavorite ? t('prayers.favoriteRemove') : t('prayers.favoriteAdd')} onPress={() => void toggleFavorite(prayer.id)}>
                    <Text style={[styles.favorite, isFavorite && styles.favoriteActive]}>{isFavorite ? '♥' : '♡'}</Text>
                  </Pressable>
                </View>
              </Card>
            );
          })}
          {filtered.length === 0 ? (
            <View style={styles.noResults}>
              <Text style={styles.empty}>{prayers.length === 0 ? t('prayers.empty') : t('prayers.notFound')}</Text>
              {prayers.length > 0 ? <PrimaryButton label={t('prayers.askChat')} onPress={() => router.push('/chat')} /> : null}
            </View>
          ) : null}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: { backgroundColor: palette.paper, borderColor: palette.line, borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, minHeight: 50, color: palette.ink, fontSize: 16 },
  searchHint: { color: palette.muted, fontSize: 12, lineHeight: 17, marginTop: -4 },
  aiVoiceNotice: { color: palette.muted, fontSize: 12, lineHeight: 17, marginTop: -5 },
  untranslatedNotice: { color: palette.goldDark, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  list: { gap: 12 },
  row: { flexDirection: 'row', gap: 12 },
  copy: { flex: 1, gap: 7 },
  category: { color: palette.goldDark, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  title: { color: palette.ink, fontSize: 17, fontWeight: '800' },
  preview: { color: palette.muted, fontSize: 14, lineHeight: 21 },
  source: { color: palette.muted, fontSize: 11, fontStyle: 'italic', lineHeight: 16 },
  readButton: { color: palette.blue, fontSize: 14, fontWeight: '800', paddingVertical: 4 },
  audioButton: { color: palette.goldDark, fontSize: 14, fontWeight: '800', paddingVertical: 4 },
  favorite: { color: palette.muted, fontSize: 26 },
  favoriteActive: { color: palette.danger },
  empty: { color: palette.muted, textAlign: 'center', paddingVertical: 12 },
  noResults: { gap: 8 },
  loading: { alignItems: 'center', gap: 8, paddingVertical: 28 },
  errorCard: { borderColor: palette.danger },
  errorText: { color: palette.danger, fontSize: 14, lineHeight: 20 },
  retry: { color: palette.blue, fontWeight: '800' },
});
