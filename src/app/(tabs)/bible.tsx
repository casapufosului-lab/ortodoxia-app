import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Card, PageHeader, PrimaryButton, Screen, SectionTitle } from '@/components/mvp-ui';
import { palette } from '@/constants/palette';
import { BIBLE_SOURCE } from '@/data/bible-source';
import { supabase } from '@/lib/supabase';

const books = [
  { code: 'MAT', label: 'Matei', chapters: 28 },
  { code: 'MAR', label: 'Marcu', chapters: 16 },
  { code: 'LUK', label: 'Luca', chapters: 24 },
  { code: 'JOH', label: 'Ioan', chapters: 21 },
  { code: 'ACT', label: 'Faptele Apostolilor', chapters: 28 },
  { code: 'ROM', label: 'Romani', chapters: 16 },
  { code: '1CO', label: '1 Corinteni', chapters: 16 },
  { code: '2CO', label: '2 Corinteni', chapters: 13 },
  { code: 'GAL', label: 'Galateni', chapters: 6 },
  { code: 'EPH', label: 'Efeseni', chapters: 6 },
  { code: 'PHI', label: 'Filipeni', chapters: 4 },
  { code: 'COL', label: 'Coloseni', chapters: 4 },
  { code: '1TH', label: '1 Tesaloniceni', chapters: 5 },
  { code: '2TH', label: '2 Tesaloniceni', chapters: 3 },
  { code: '1TI', label: '1 Timotei', chapters: 6 },
  { code: '2TI', label: '2 Timotei', chapters: 4 },
  { code: 'TIT', label: 'Tit', chapters: 3 },
  { code: 'PHM', label: 'Filimon', chapters: 1 },
  { code: 'HEB', label: 'Evrei', chapters: 13 },
  { code: 'JAM', label: 'Iacov', chapters: 5 },
  { code: '1PE', label: '1 Petru', chapters: 5 },
  { code: '2PE', label: '2 Petru', chapters: 3 },
  { code: '1JO', label: '1 Ioan', chapters: 5 },
  { code: '2JO', label: '2 Ioan', chapters: 1 },
  { code: '3JO', label: '3 Ioan', chapters: 1 },
  { code: 'JUD', label: 'Iuda', chapters: 1 },
  { code: 'REV', label: 'Apocalipsa', chapters: 22 },
] as const;

type BookCode = (typeof books)[number]['code'];
type BibleVerse = { verse: number; verse_text: string };

function normalizeSearchText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('ro-RO').trim();
}

export default function BibleScreen() {
  const [bookCode, setBookCode] = useState<BookCode>('MAT');
  const [chapter, setChapter] = useState(1);
  const [verses, setVerses] = useState<BibleVerse[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const book = books.find((item) => item.code === bookCode) ?? books[0];

  const loadChapter = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);

    try {
      const { data, error: requestError } = await supabase
        .from('bible_verses')
        .select('verse, verse_text')
        .eq('translation_id', BIBLE_SOURCE.id)
        .eq('book_code', bookCode)
        .eq('chapter', chapter)
        .eq('is_published', true)
        .order('verse', { ascending: true });

      if (requestError) {
        if (requestRef.current !== requestId) return;
        setVerses([]);
        setError('Textul nu s-a putut încărca. Verifică internetul și încearcă din nou.');
      } else {
        if (requestRef.current !== requestId) return;
        setVerses((data ?? []) as BibleVerse[]);
      }
    } catch {
      if (requestRef.current !== requestId) return;
      setVerses([]);
      setError('Textul nu s-a putut încărca. Verifică internetul și încearcă din nou.');
    } finally {
      if (requestRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [bookCode, chapter]);

  useEffect(() => {
    // Încărcarea pornește când utilizatorul schimbă cartea sau capitolul.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadChapter();
    return () => {
      requestRef.current += 1;
    };
  }, [loadChapter]);

  const visibleVerses = useMemo(() => {
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) return verses;
    return verses.filter((item) => normalizeSearchText(`${item.verse} ${item.verse_text}`).includes(normalizedQuery));
  }, [query, verses]);

  function selectBook(code: BookCode) {
    setBookCode(code);
    setChapter(1);
    setQuery('');
  }

  return (
    <Screen>
      <PageHeader
        eyebrow={`${BIBLE_SOURCE.name} · ${BIBLE_SOURCE.scope}`}
        title="Biblia, aproape de tine"
        subtitle="Alege cartea și capitolul pentru a citi în ritmul tău."
      />

      <Card style={styles.sourceCard}>
        <Text style={styles.sourceLabel}>Sursa biblică</Text>
        <Text style={styles.sourceTitle}>{BIBLE_SOURCE.name}</Text>
        <Text style={styles.sourceText}>
          Noul Testament, traducere în curs de revizuire și disponibilă în domeniul public. Nu este prezentată drept ediția sinodală ortodoxă.
        </Text>
        <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(BIBLE_SOURCE.copyrightUrl)}>
          <Text style={styles.sourceLink}>Vezi sursa și condițiile de folosire</Text>
        </Pressable>
      </Card>

      <SectionTitle>Carte</SectionTitle>
      <View style={styles.bookGrid}>
        {books.map((item) => (
          <Pressable
            key={item.code}
            accessibilityRole="button"
            accessibilityState={{ selected: item.code === bookCode }}
            onPress={() => selectBook(item.code)}
            style={[styles.bookButton, item.code === bookCode && styles.bookButtonSelected]}>
            <Text style={[styles.bookButtonText, item.code === bookCode && styles.bookButtonTextSelected]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>

      <SectionTitle>Capitol</SectionTitle>
      <View style={styles.chapterRow}>
        {Array.from({ length: book.chapters }, (_, index) => index + 1).map((item) => (
          <Pressable
            key={item}
            accessibilityRole="button"
            accessibilityState={{ selected: item === chapter }}
            onPress={() => { setChapter(item); setQuery(''); }}
            style={[styles.chapterButton, item === chapter && styles.chapterButtonSelected]}>
            <Text style={[styles.chapterText, item === chapter && styles.chapterTextSelected]}>{item}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.navigationRow}>
        <Pressable
          accessibilityRole="button"
          disabled={chapter === 1}
          onPress={() => { setChapter((current) => Math.max(1, current - 1)); setQuery(''); }}
          style={[styles.navigationButton, chapter === 1 && styles.navigationButtonDisabled]}>
          <Text style={styles.navigationText}>Capitolul anterior</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={chapter === book.chapters}
          onPress={() => { setChapter((current) => Math.min(book.chapters, current + 1)); setQuery(''); }}
          style={[styles.navigationButton, chapter === book.chapters && styles.navigationButtonDisabled]}>
          <Text style={styles.navigationText}>Capitolul următor</Text>
        </Pressable>
      </View>

      <TextInput
        accessibilityLabel="Caută în capitolul curent"
        autoCapitalize="none"
        onChangeText={setQuery}
        placeholder="Caută în capitolul curent"
        placeholderTextColor={palette.muted}
        style={styles.searchInput}
        value={query}
      />

      <Card style={styles.readerCard}>
        <Text style={styles.reference}>{book.label} {chapter}</Text>
        {loading ? (
          <View style={styles.statusBox}>
            <ActivityIndicator color={palette.blue} />
            <Text style={styles.statusText}>Se încarcă textul...</Text>
          </View>
        ) : error ? (
          <View style={styles.statusBox}>
            <Text style={styles.errorText}>{error}</Text>
            <PrimaryButton label="Încearcă din nou" onPress={() => void loadChapter()} />
          </View>
        ) : verses.length === 0 ? (
          <Text style={styles.statusText}>Acest capitol nu are încă versete publicate.</Text>
        ) : visibleVerses.length === 0 ? (
          <Text style={styles.statusText}>Nu am găsit acest cuvânt în capitolul curent.</Text>
        ) : (
          <View style={styles.verseList}>
            {visibleVerses.map((item) => (
              <Text key={item.verse} style={styles.verseText}>
                <Text style={styles.verseNumber}>{item.verse} </Text>
                {item.verse_text}
              </Text>
            ))}
          </View>
        )}
      </Card>

      <PrimaryButton label="Deschide sursa originală" onPress={() => void Linking.openURL(BIBLE_SOURCE.sourceUrl)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  sourceCard: { backgroundColor: palette.blueSoft, borderColor: palette.blueSoft },
  sourceLabel: { color: palette.blue, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  sourceTitle: { color: palette.ink, fontSize: 20, fontWeight: '800' },
  sourceText: { color: palette.blue, fontSize: 13, lineHeight: 20 },
  sourceLink: { color: palette.blue, fontSize: 13, fontWeight: '800', textDecorationLine: 'underline' },
  bookGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bookButton: { minWidth: '30%', flexGrow: 1, paddingVertical: 12, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.paper, alignItems: 'center' },
  bookButtonSelected: { borderColor: palette.gold, backgroundColor: palette.background },
  bookButtonText: { color: palette.muted, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  bookButtonTextSelected: { color: palette.goldDark },
  chapterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chapterButton: { width: 46, height: 42, borderRadius: 12, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.paper, alignItems: 'center', justifyContent: 'center' },
  chapterButtonSelected: { borderColor: palette.blue, backgroundColor: palette.blueSoft },
  chapterText: { color: palette.muted, fontSize: 15, fontWeight: '800' },
  chapterTextSelected: { color: palette.blue },
  navigationRow: { flexDirection: 'row', gap: 10 },
  navigationButton: { flex: 1, minHeight: 46, borderRadius: 12, backgroundColor: palette.blueSoft, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  navigationButtonDisabled: { opacity: 0.4 },
  navigationText: { color: palette.blue, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  searchInput: { minHeight: 50, borderWidth: 1, borderColor: palette.line, borderRadius: 14, backgroundColor: palette.paper, color: palette.ink, paddingHorizontal: 16, fontSize: 15 },
  readerCard: { backgroundColor: palette.background, borderColor: '#F0DFC1', paddingVertical: 24 },
  reference: { color: palette.goldDark, fontSize: 15, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  verseList: { gap: 12 },
  verseText: { color: palette.ink, fontSize: 17, lineHeight: 28, fontFamily: 'serif' },
  verseNumber: { color: palette.goldDark, fontSize: 13, fontWeight: '800', fontFamily: undefined },
  statusBox: { gap: 14 },
  statusText: { color: palette.muted, fontSize: 15, lineHeight: 22 },
  errorText: { color: palette.danger, fontSize: 15, lineHeight: 22 },
});
