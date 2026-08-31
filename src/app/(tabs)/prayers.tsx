import { router } from 'expo-router';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Card, PageHeader, PrimaryButton, Screen } from '@/components/mvp-ui';
import { palette } from '@/constants/palette';
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

function normalizeSearchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('ro')
    .trim();
}

export default function PrayersScreen() {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [prayers, setPrayers] = useState<Prayer[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const audioPlayerRef = useRef<AudioPlayer | null>(null);

  const loadPrayers = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');

    const { data, error } = await supabase
      .from('prayers')
      .select('id, category, title, body, editorial_source, audio_path')
      .eq('is_published', true)
      .order('sort_order', { ascending: true });

    if (error) {
      setErrorMessage('Nu am putut încărca rugăciunile. Încearcă din nou.');
      setIsLoading(false);
      return;
    }

    setPrayers(data ?? []);

    if (user) {
      const { data: favorites, error: favoritesError } = await supabase
        .from('favorites')
        .select('prayer_id')
        .eq('user_id', user.id);

      if (favoritesError) {
        setErrorMessage('Rugăciunile s-au încărcat, dar favoritele nu au putut fi citite.');
      } else {
        setFavoriteIds((favorites ?? []).map((favorite) => favorite.prayer_id));
      }
    } else {
      setFavoriteIds([]);
    }

    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    const timeoutId = setTimeout(() => void loadPrayers(), 0);
    return () => clearTimeout(timeoutId);
  }, [loadPrayers]);

  useEffect(() => () => {
    void Speech.stop();
    audioPlayerRef.current?.release();
    audioPlayerRef.current = null;
  }, []);

  const filtered = useMemo(() => {
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) return prayers;
    return prayers.filter((prayer) =>
      normalizeSearchText(`${prayer.title} ${prayer.category} ${prayer.body}`).includes(normalizedQuery),
    );
  }, [prayers, query]);

  const toggleFavorite = async (prayerId: string) => {
    if (!user) {
      router.push('/auth');
      return;
    }

    const wasFavorite = favoriteIds.includes(prayerId);
    setFavoriteIds((ids) => wasFavorite ? ids.filter((id) => id !== prayerId) : [...ids, prayerId]);

    const result = wasFavorite
      ? await supabase.from('favorites').delete().eq('user_id', user.id).eq('prayer_id', prayerId)
      : await supabase.from('favorites').insert({ user_id: user.id, prayer_id: prayerId });

    if (result.error) {
      setFavoriteIds((ids) => wasFavorite ? [...ids, prayerId] : ids.filter((id) => id !== prayerId));
      setErrorMessage('Favoritul nu a fost salvat. Încearcă din nou.');
    } else {
      setErrorMessage('');
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

    await Speech.stop();
    audioPlayerRef.current?.pause();
    audioPlayerRef.current?.release();
    audioPlayerRef.current = null;
    setSpeakingId(prayer.id);

    if (prayer.audio_path) {
      try {
        const { data } = supabase.storage.from('prayer-audio').getPublicUrl(prayer.audio_path);
        const player = createAudioPlayer(data.publicUrl, { updateInterval: 250 });
        audioPlayerRef.current = player;
        player.addListener('playbackStatusUpdate', (status) => {
          if (!status.didJustFinish) return;
          player.release();
          if (audioPlayerRef.current === player) audioPlayerRef.current = null;
          setSpeakingId((currentId) => currentId === prayer.id ? null : currentId);
        });
        player.play();
        return;
      } catch {
        audioPlayerRef.current?.release();
        audioPlayerRef.current = null;
        setSpeakingId(null);
        setErrorMessage('Fișierul audio nu a putut porni. Încearcă din nou.');
        return;
      }
    }

    Speech.speak(`${prayer.title}. ${prayer.body}`, {
      language: 'ro-RO',
      rate: 0.85,
      onDone: () => setSpeakingId(null),
      onStopped: () => setSpeakingId(null),
      onError: () => {
        setSpeakingId(null);
        setErrorMessage('Citirea audio nu a putut porni pe acest dispozitiv.');
      },
    });
  };

  return (
    <Screen>
      <PageHeader eyebrow="Bibliotecă" title="Rugăciuni" subtitle="Caută după titlu și păstrează rugăciunile apropiate inimii tale." />
      <Text style={styles.aiVoiceNotice}>Înregistrările naturale sunt voci generate cu inteligență artificială.</Text>
      <TextInput accessibilityLabel="Caută o rugăciune" placeholder="Caută o rugăciune" placeholderTextColor={palette.muted} value={query} onChangeText={setQuery} style={styles.search} />
      <Text style={styles.searchHint}>Poți căuta cu sau fără diacritice, de exemplu: „tatal nostru”.</Text>
      {errorMessage ? (
        <Card style={styles.errorCard}>
          <Text style={styles.errorText}>{errorMessage}</Text>
          <Pressable accessibilityRole="button" onPress={() => void loadPrayers()}>
            <Text style={styles.retry}>Reîncearcă</Text>
          </Pressable>
        </Card>
      ) : null}
      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={palette.blue} />
          <Text style={styles.empty}>Se încarcă rugăciunile...</Text>
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
                    {prayer.editorial_source && isExpanded ? <Text style={styles.source}>{prayer.editorial_source}</Text> : null}
                    <Pressable accessibilityRole="button" onPress={() => setExpandedId(isExpanded ? null : prayer.id)}>
                      <Text style={styles.readButton}>{isExpanded ? 'Închide' : 'Citește rugăciunea'}</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel={speakingId === prayer.id ? `Oprește ${prayer.title}` : `Ascultă ${prayer.title}`} onPress={() => void toggleAudio(prayer)}>
                      <Text style={styles.audioButton}>{speakingId === prayer.id ? '■ Oprește' : '▶ Ascultă'}</Text>
                    </Pressable>
                  </View>
                  <Pressable accessibilityRole="button" accessibilityLabel={isFavorite ? 'Elimină din favorite' : 'Adaugă la favorite'} onPress={() => void toggleFavorite(prayer.id)}>
                    <Text style={[styles.favorite, isFavorite && styles.favoriteActive]}>{isFavorite ? '♥' : '♡'}</Text>
                  </Pressable>
                </View>
              </Card>
            );
          })}
          {filtered.length === 0 ? (
            <View style={styles.noResults}>
              <Text style={styles.empty}>{prayers.length === 0 ? 'Nu există încă rugăciuni publicate.' : 'Rugăciunea nu este încă în bibliotecă.'}</Text>
              {prayers.length > 0 ? <PrimaryButton label="Întreabă Chatul" onPress={() => router.push('/chat')} /> : null}
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
