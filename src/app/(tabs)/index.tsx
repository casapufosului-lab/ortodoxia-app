import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, PageHeader, PrimaryButton, Screen, SectionTitle } from '@/components/mvp-ui';
import { palette } from '@/constants/palette';
import { dateKeyInTimeZone } from '@/i18n/config';
import { supabase } from '@/lib/supabase';
import { useLocalization } from '@/providers/localization-provider';

type DailyContent = {
  verse_text: string;
  verse_source: string;
  parable_title: string;
  parable_text: string;
  editorial_source: string | null;
};

type CalendarDay = {
  title: string;
  saints: string[];
  fasting_note: string | null;
};

export default function HomeScreen() {
  const { calendar, calendarCode, countryCode, region, t } = useLocalization();
  const today = useMemo(() => new Date(), []);
  const dateKey = useMemo(() => dateKeyInTimeZone(today, region.timeZone), [region.timeZone, today]);
  const dateLabel = useMemo(() => new Intl.DateTimeFormat(region.locale, {
    day: 'numeric',
    month: 'long',
    timeZone: region.timeZone,
    weekday: 'long',
  }).format(today), [region.locale, region.timeZone, today]);
  const dayNumber = Number(dateKey.slice(-2));
  const [dailyContent, setDailyContent] = useState<DailyContent | null>(null);
  const [calendarDay, setCalendarDay] = useState<CalendarDay | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const loadHome = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');

    if (!calendarCode) {
      setDailyContent(null);
      setCalendarDay(null);
      setIsLoading(false);
      return;
    }

    let [dailyResult, calendarResult] = await Promise.all([
      supabase
        .from('daily_content')
        .select('verse_text, verse_source, parable_title, parable_text, editorial_source')
        .eq('country_code', countryCode)
        .eq('language_code', region.languageCode)
        .eq('content_date', dateKey)
        .eq('is_published', true)
        .maybeSingle(),
      supabase
        .from('calendar_days')
        .select('title, saints, fasting_note')
        .eq('country_code', countryCode)
        .eq('language_code', region.languageCode)
        .eq('calendar_code', calendarCode)
        .eq('calendar_date', dateKey)
        .eq('is_published', true)
        .maybeSingle(),
    ]);

    const localizationSchemaMissing = [dailyResult.error, calendarResult.error].some((error) => (
      error?.code === '42703' || Boolean(error?.message.match(/(country_code|language_code|calendar_code).*does not exist/i))
    ));

    if (localizationSchemaMissing && countryCode === 'RO') {
      [dailyResult, calendarResult] = await Promise.all([
        supabase
          .from('daily_content')
          .select('verse_text, verse_source, parable_title, parable_text, editorial_source')
          .eq('content_date', dateKey)
          .eq('is_published', true)
          .maybeSingle(),
        supabase
          .from('calendar_days')
          .select('title, saints, fasting_note')
          .eq('calendar_date', dateKey)
          .eq('is_published', true)
          .maybeSingle(),
      ]);
    } else if (localizationSchemaMissing) {
      setDailyContent(null);
      setCalendarDay(null);
      setIsLoading(false);
      return;
    }

    if (dailyResult.error || calendarResult.error) {
      setErrorMessage('Conținutul zilei nu a putut fi încărcat. Încearcă din nou.');
    }

    setDailyContent(dailyResult.data);
    setCalendarDay(calendarResult.data);
    setIsLoading(false);
  }, [calendarCode, countryCode, dateKey, region.languageCode]);

  useEffect(() => {
    const timeoutId = setTimeout(() => void loadHome(), 0);
    return () => clearTimeout(timeoutId);
  }, [loadHome]);

  return (
    <Screen>
      <PageHeader eyebrow={dateLabel} title="Pace ție" subtitle={`${region.countryLabel} · Un loc simplu pentru rugăciune, calendar și întrebări.`} />
      {countryCode === 'MD' ? (
        <Card style={styles.noticeCard}>
          <Text style={styles.noticeTitle}>{calendar?.label ?? t('account.calendarRequired')}</Text>
          <Text style={styles.noticeText}>{calendar ? t('region.moldovaCalendarPending') : t('region.moldovaChooseCalendar')}</Text>
          {!calendar ? <PrimaryButton label="Alege calendarul" onPress={() => router.push('/account')} /> : null}
        </Card>
      ) : null}
      {errorMessage ? (
        <Card style={styles.errorCard}>
          <Text style={styles.errorText}>{errorMessage}</Text>
          <Pressable accessibilityRole="button" onPress={() => void loadHome()}>
            <Text style={styles.retry}>Reîncearcă</Text>
          </Pressable>
        </Card>
      ) : null}
      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={palette.blue} />
          <Text style={styles.loadingText}>Se încarcă ziua de astăzi...</Text>
        </View>
      ) : (
        <>
          <Card style={styles.heroCard}>
            <Text style={styles.cross}>☦</Text>
            <Text style={styles.quote}>{dailyContent ? `„${dailyContent.verse_text}”` : '„Pacea Mea o dau vouă.”'}</Text>
            <Text style={styles.source}>{dailyContent?.verse_source ?? 'Ioan 14, 27'}</Text>
          </Card>
          <SectionTitle>Pilda zilei</SectionTitle>
          <Card>
            <Text style={styles.cardTitle}>{dailyContent?.parable_title ?? 'Pilda semănătorului'}</Text>
            <Text style={styles.body}>{dailyContent?.parable_text ?? 'Un suflet atent primește cuvântul bun și îl transformă în faptă.'}</Text>
            {dailyContent?.editorial_source ? <Text style={styles.editorialSource}>{dailyContent.editorial_source}</Text> : null}
          </Card>
          <SectionTitle>Astăzi în calendar</SectionTitle>
          <Card>
            <View style={styles.calendarRow}>
              <View style={styles.dateBox}><Text style={styles.dateNumber}>{dayNumber}</Text></View>
              <View style={styles.flex}>
                <Text style={styles.calendarTitle}>{calendarDay?.title ?? 'Astăzi în calendarul ortodox'}</Text>
                {calendarDay?.fasting_note ? <Text style={styles.fasting}>{calendarDay.fasting_note}</Text> : null}
              </View>
            </View>
          </Card>
        </>
      )}
      <PrimaryButton label="Întreabă ghidul AI" onPress={() => router.push('/chat')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroCard: { backgroundColor: palette.blue, borderColor: palette.blue, alignItems: 'center', paddingVertical: 26 },
  cross: { color: palette.gold, fontSize: 28 },
  quote: { color: '#FFFFFF', fontSize: 20, lineHeight: 30, fontFamily: 'serif', textAlign: 'center' },
  source: { color: '#D7E0EA', fontSize: 13, fontWeight: '700' },
  cardTitle: { color: palette.ink, fontSize: 17, fontWeight: '800' },
  body: { color: palette.muted, fontSize: 15, lineHeight: 22 },
  calendarRow: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  dateBox: { width: 52, height: 52, borderRadius: 14, backgroundColor: palette.blueSoft, alignItems: 'center', justifyContent: 'center' },
  dateNumber: { color: palette.blue, fontSize: 22, fontWeight: '800' },
  flex: { flex: 1, gap: 5 },
  calendarTitle: { color: palette.ink, fontSize: 15, lineHeight: 21, fontWeight: '800' },
  fasting: { color: palette.goldDark, fontSize: 12, fontWeight: '800' },
  editorialSource: { color: palette.muted, fontSize: 11, fontStyle: 'italic', lineHeight: 16 },
  loading: { alignItems: 'center', gap: 8, paddingVertical: 38 },
  loadingText: { color: palette.muted, fontSize: 14 },
  noticeCard: { backgroundColor: palette.blueSoft, borderColor: palette.blueSoft },
  noticeTitle: { color: palette.blue, fontSize: 14, fontWeight: '800' },
  noticeText: { color: palette.blue, fontSize: 13, lineHeight: 19 },
  errorCard: { borderColor: palette.danger },
  errorText: { color: palette.danger, fontSize: 14, lineHeight: 20 },
  retry: { color: palette.blue, fontWeight: '800' },
});
