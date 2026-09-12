import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, PageHeader, PrimaryButton, Screen, SectionTitle } from '@/components/mvp-ui';
import { palette } from '@/constants/palette';
import { dateKeyInTimeZone, getCountryLabel } from '@/i18n/config';
import { getEnabledLiveSources } from '@/live/live-services';
import { getMoldovaCalendarFallbackDay, hasMoldovaCalendarFallback } from '@/lib/moldova-calendar-fallback';
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
  const { calendar, calendarCode, countryCode, languageCode, region, t } = useLocalization();
  const calendarLanguageCode = languageCode === region.languageCode ? region.languageCode : 'en';
  const liveLocations = getEnabledLiveSources(countryCode).map((source) => source.location).join(' • ');
  const [today, setToday] = useState(() => new Date());
  const dateKey = useMemo(() => dateKeyInTimeZone(today, region.timeZone), [region.timeZone, today]);
  const dateLabel = useMemo(() => new Intl.DateTimeFormat(languageCode, {
    day: 'numeric',
    month: 'long',
    timeZone: region.timeZone,
    weekday: 'long',
  }).format(today), [languageCode, region.timeZone, today]);
  const dayNumber = Number(dateKey.slice(-2));
  const [dailyContent, setDailyContent] = useState<DailyContent | null>(null);
  const [calendarDay, setCalendarDay] = useState<CalendarDay | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const refreshToday = () => setToday(new Date());
    const intervalId = setInterval(refreshToday, 60_000);
    const appStateListener = Platform.OS === 'web'
      ? null
      : AppState.addEventListener('change', (state) => {
          if (state === 'active') refreshToday();
        });

    return () => {
      clearInterval(intervalId);
      appStateListener?.remove();
    };
  }, []);
  const homeRequestRef = useRef(0);

  const loadHome = useCallback(async () => {
    const requestId = ++homeRequestRef.current;
    setIsLoading(true);
    setErrorMessage('');
    setDailyContent(null);
    setCalendarDay(null);

    try {
      if (!calendarCode) {
        setDailyContent(null);
        setCalendarDay(null);
        return;
      }

      if (hasMoldovaCalendarFallback(calendarCode)) {
        setCalendarDay(getMoldovaCalendarFallbackDay(calendarCode, dateKey));
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
          .rpc('get_calendar_days_localized', {
            p_country_code: countryCode,
            p_calendar_code: calendarCode,
            p_language_code: calendarLanguageCode,
            p_start_date: dateKey,
            p_end_date: dateKey,
          })
          .maybeSingle(),
      ]);

      if (homeRequestRef.current !== requestId) return;

      const calendarRpcMissing = calendarResult.error?.code === 'PGRST202'
        || calendarResult.error?.code === '42883'
        || Boolean(calendarResult.error?.message.match(/get_calendar_days_localized/i));

      if (calendarRpcMissing) {
        calendarResult = await supabase
          .from('calendar_days')
          .select('title, saints, fasting_note')
          .eq('country_code', countryCode)
          .eq('language_code', region.languageCode)
          .eq('calendar_code', calendarCode)
          .eq('calendar_date', dateKey)
          .eq('is_published', true)
          .maybeSingle();
      }

      const dailyLocalizationSchemaMissing = dailyResult.error?.code === '42703'
        || Boolean(dailyResult.error?.message.match(/(country_code|language_code).*does not exist/i));

      if (dailyLocalizationSchemaMissing && countryCode === 'RO') {
        dailyResult = await supabase
          .from('daily_content')
          .select('verse_text, verse_source, parable_title, parable_text, editorial_source')
          .eq('content_date', dateKey)
          .eq('is_published', true)
          .maybeSingle();
      } else if (dailyLocalizationSchemaMissing) {
        setDailyContent(null);
        setCalendarDay(null);
        return;
      }

      if (homeRequestRef.current !== requestId) return;

      if (dailyResult.error || calendarResult.error) {
        setErrorMessage(t('home.loadError'));
        return;
      }

      setDailyContent(dailyResult.data as DailyContent);
      setCalendarDay(
        hasMoldovaCalendarFallback(calendarCode)
          ? getMoldovaCalendarFallbackDay(calendarCode, dateKey)
          : (calendarResult.data as CalendarDay | null),
      );
    } catch {
      if (homeRequestRef.current !== requestId) return;
      setErrorMessage(t('home.unexpectedError'));
    } finally {
      if (homeRequestRef.current === requestId) {
        setIsLoading(false);
      }
    }
  }, [calendarCode, calendarLanguageCode, countryCode, dateKey, region.languageCode, t]);

  useEffect(() => {
    const timeoutId = setTimeout(() => void loadHome(), 0);
    return () => {
      clearTimeout(timeoutId);
      homeRequestRef.current += 1;
    };
  }, [loadHome]);

  return (
    <Screen>
      <PageHeader eyebrow={dateLabel} title={t('home.pageTitle')} subtitle={`${getCountryLabel(countryCode, languageCode)} · ${t('home.pageSubtitle')}`} />
      {countryCode === 'MD' ? (
        <Card style={styles.noticeCard}>
          <Text style={styles.noticeTitle}>{calendar?.label ?? t('account.calendarRequired')}</Text>
          <Text style={styles.noticeText}>{calendar ? calendar.description : t('region.moldovaChooseCalendar')}</Text>
        </Card>
      ) : null}
      {errorMessage ? (
        <Card style={styles.errorCard}>
          <Text style={styles.errorText}>{errorMessage}</Text>
          <Pressable accessibilityRole="button" onPress={() => void loadHome()}>
            <Text style={styles.retry}>{t('common.retry')}</Text>
          </Pressable>
        </Card>
      ) : null}
      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={palette.blue} />
          <Text style={styles.loadingText}>{t('home.loadingToday')}</Text>
        </View>
      ) : (
        <>
          <Card style={styles.heroCard}>
            <Text style={styles.cross}>☦</Text>
            <Text style={styles.quote}>{dailyContent ? `„${dailyContent.verse_text}”` : t('home.verseFallback')}</Text>
            <Text style={styles.source}>{dailyContent?.verse_source ?? t('home.verseSourceFallback')}</Text>
          </Card>
          <SectionTitle>{t('home.parableSectionTitle')}</SectionTitle>
          <Card>
            <Text style={styles.cardTitle}>{dailyContent?.parable_title ?? t('home.parableTitleFallback')}</Text>
            <Text style={styles.body}>{dailyContent?.parable_text ?? t('home.parableBodyFallback')}</Text>
            {dailyContent?.editorial_source ? <Text style={styles.editorialSource}>{dailyContent.editorial_source}</Text> : null}
          </Card>
          <SectionTitle>{t('home.calendarSectionTitle')}</SectionTitle>
          <Card>
            <View style={styles.calendarRow}>
              <View style={styles.dateBox}><Text style={styles.dateNumber}>{dayNumber}</Text></View>
              <View style={styles.flex}>
                <Text style={styles.calendarTitle}>{calendarDay?.title ?? t('home.calendarDayFallback')}</Text>
                {calendarDay?.fasting_note ? <Text style={styles.fasting}>{calendarDay.fasting_note}</Text> : null}
              </View>
            </View>
          </Card>
        </>
      )}
      <SectionTitle>{t('home.liveSectionTitle')}</SectionTitle>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('home.liveAccessibilityLabel')}
        onPress={() => router.push('/live')}
        style={({ pressed }) => [styles.liveCard, pressed && styles.pressed]}
      >
        <View style={styles.liveHeader}>
          <Text style={styles.liveCross}>▶</Text>
          <View style={styles.liveFlex}>
            <Text style={styles.liveTitle}>{t('home.liveSectionTitle')}</Text>
            <Text style={styles.liveSubtitle}>{t('home.liveSubtitle')}</Text>
            {liveLocations ? <Text style={styles.liveLocation}>{liveLocations}</Text> : null}
          </View>
          <Text style={styles.liveArrow}>›</Text>
        </View>
      </Pressable>
      <PrimaryButton label={t('home.askAiGuide')} onPress={() => router.push('/chat')} />
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
  liveCard: {
    backgroundColor: palette.paper,
    borderColor: palette.line,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
  },
  liveHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  liveCross: { color: palette.goldDark, fontSize: 22, fontWeight: '800' },
  liveFlex: { flex: 1, gap: 3 },
  liveTitle: { color: palette.ink, fontSize: 17, fontWeight: '800' },
  liveSubtitle: { color: palette.muted, fontSize: 14, lineHeight: 20, flexShrink: 1 },
  liveLocation: { color: palette.goldDark, fontSize: 12, lineHeight: 17 },
  liveArrow: { color: palette.muted, fontSize: 22, fontWeight: '700' },
  pressed: { opacity: 0.75 },
});
