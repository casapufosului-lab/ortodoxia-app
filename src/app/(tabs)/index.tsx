import { router } from 'expo-router';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, PrimaryButton, Screen, SectionTitle } from '@/components/mvp-ui';
import { palette } from '@/constants/palette';
import { dateKeyInTimeZone, getCountryLabel } from '@/i18n/config';
import { getEnabledLiveSources } from '@/live/live-services';
import {
  feastRankLabelKey,
  isCalendarRpcUnavailable,
  resolveFeastRankCode,
} from '@/lib/feast-rank';
import { calendarDisplayDescription, calendarDisplayName } from '@/lib/calendar-labels';
import { verseSourceLabel } from '@/lib/content-source';
import { localizeLocation } from '@/lib/i18n-locations';
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
  feast_rank: string | null;
  feast_rank_code: string | null;
};

export default function HomeScreen() {
  const { calendar, calendarCode, countryCode, languageCode, region, t } = useLocalization();
  // Query content in the language the user actually selected. The previous
  // `language === region ? region : 'en'` mapping silently served English to a
  // user who had chosen another supported language.
  // Localized place names for the enabled LIVE sources (falls back to the
  // canonical registry value when a place has no translated name).
  const liveLocations = getEnabledLiveSources(countryCode)
    .map((source) => localizeLocation(source.location, t))
    .join(' • ');
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

  // Sursa de sub pildă: referința biblică atunci când e citibilă, altfel nimic. Fără „NULL"
  // (text literal în 2 158 de rânduri) și fără id-ul intern de material (pozițiile A1/A2/B12).
  const parableSourceLabel = verseSourceLabel(dailyContent?.verse_source, dailyContent?.editorial_source);
  // Localized rank label for the day's commemoration (canonical code → i18n key).
  const calendarDayRankLabelKey = calendarDay
    ? feastRankLabelKey(resolveFeastRankCode(calendarDay.feast_rank_code, calendarDay.feast_rank))
    : null;

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
        // No calendar selected (only possible for Moldova, whose calendar the
        // user must choose explicitly). Still load the verse and parable: those
        // come from `daily_content`, which is independent of the calendar.
        const dailyOnly = await supabase
          .from('daily_content')
          .select('verse_text, verse_source, parable_title, parable_text, editorial_source')
          .eq('country_code', countryCode)
          .eq('language_code', languageCode)
          .eq('content_date', dateKey)
          .eq('is_published', true)
          .maybeSingle();
        if (homeRequestRef.current !== requestId) return;
        if (!dailyOnly.error && dailyOnly.data) {
          setDailyContent(dailyOnly.data as DailyContent);
        }
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
          .eq('language_code', languageCode)
          .eq('content_date', dateKey)
          .eq('is_published', true)
          .maybeSingle(),
        supabase
          .rpc('get_calendar_days_localized', {
            p_country_code: countryCode,
            p_calendar_code: calendarCode,
            p_language_code: languageCode,
            p_start_date: dateKey,
            p_end_date: dateKey,
          })
          .maybeSingle(),
      ]);

      if (homeRequestRef.current !== requestId) return;

      const calendarRpcMissing = isCalendarRpcUnavailable(calendarResult.error);

      if (calendarRpcMissing) {
        calendarResult = await supabase
          .from('calendar_days')
          .select('title, saints, fasting_note, feast_rank, feast_rank_code')
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
  }, [calendarCode, countryCode, dateKey, languageCode, region.languageCode, t]);

  useEffect(() => {
    const timeoutId = setTimeout(() => void loadHome(), 0);
    return () => {
      clearTimeout(timeoutId);
      homeRequestRef.current += 1;
    };
  }, [loadHome]);

  return (
    <Screen contentStyle={styles.homeContent}>
      <View style={styles.hero}>
        <Image
          accessible={false}
          contentFit="cover"
          source={require('@/assets/images/splash-icon.png')}
          style={styles.heroImage}
        />
        <View style={styles.heroOverlay} />
        <View style={styles.heroContent}>
          <Image
            accessible={false}
            contentFit="contain"
            source={require('@/assets/images/splash-icon.png')}
            style={styles.heroMark}
          />
          <Text style={styles.heroEyebrow}>{dateLabel}</Text>
          <Text style={styles.heroTitle}>{t('home.heroTitle')}</Text>
          <Text style={styles.heroSubtitle}>{`${getCountryLabel(countryCode, languageCode)} · ${t('home.pageSubtitle')}`}</Text>
        </View>
      </View>
      {countryCode === 'MD' ? (
        <Card style={styles.noticeCard}>
          <Text style={styles.noticeTitle}>{calendar ? calendarDisplayName(calendar.calendarCode, calendar.label, t) : t('account.calendarRequired')}</Text>
          <Text style={styles.noticeText}>{calendar ? calendarDisplayDescription(calendar.calendarCode, calendar.description, t) : t('region.moldovaChooseCalendar')}</Text>
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
          <SectionTitle>{t('home.parableSectionTitle')}</SectionTitle>
          <Card style={styles.compactCard}>
            <Text style={styles.cardTitle}>{dailyContent?.parable_title ?? t('home.parableTitleFallback')}</Text>
            <Text style={styles.body}>{dailyContent?.parable_text ?? t('home.parableBodyFallback')}</Text>
            {parableSourceLabel ? <Text style={styles.editorialSource}>{parableSourceLabel}</Text> : null}
          </Card>
          <SectionTitle>{t('home.calendarSectionTitle')}</SectionTitle>
          <Card style={styles.compactCard}>
            <View style={styles.calendarRow}>
              <View style={styles.dateBox}><Text style={styles.dateNumber}>{dayNumber}</Text></View>
              <View style={styles.flex}>
                <Text style={styles.calendarTitle}>{calendarDay?.title ?? t('home.calendarDayFallback')}</Text>
                {calendarDayRankLabelKey ? <Text style={styles.calendarRank}>{t(calendarDayRankLabelKey)}</Text> : null}
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
  homeContent: { gap: 12, paddingTop: 12, paddingBottom: 18 },
  hero: { borderRadius: 22, overflow: 'hidden', backgroundColor: palette.primaryDeep, minHeight: 176, justifyContent: 'flex-end' },
  heroImage: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.35 },
  heroOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: palette.overlay },
  heroContent: { padding: 14, gap: 3 },
  heroMark: { width: 46, height: 46, borderRadius: 12, marginBottom: 2 },
  heroEyebrow: { color: palette.goldLight, fontSize: 12, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
  heroTitle: { color: '#FFFFFF', fontSize: 30, lineHeight: 34, fontWeight: '800' },
  heroSubtitle: { color: palette.sky, fontSize: 14, lineHeight: 19 },
  compactCard: { padding: 13, gap: 6 },
  cross: { color: palette.gold, fontSize: 28 },
  quote: { color: palette.ink, fontSize: 20, lineHeight: 30, fontFamily: 'serif', textAlign: 'center' },
  source: { color: palette.goldDark, fontSize: 13, fontWeight: '700' },
  cardTitle: { color: palette.ink, fontSize: 17, fontWeight: '800' },
  body: { color: palette.muted, fontSize: 15, lineHeight: 22 },
  calendarRow: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  dateBox: { width: 52, height: 52, borderRadius: 14, backgroundColor: palette.blueSoft, alignItems: 'center', justifyContent: 'center' },
  dateNumber: { color: palette.blue, fontSize: 22, fontWeight: '800' },
  flex: { flex: 1, gap: 5 },
  calendarTitle: { color: palette.ink, fontSize: 15, lineHeight: 21, fontWeight: '800' },
  calendarRank: { color: palette.blue, fontSize: 12, fontWeight: '700', marginTop: 2 },
  fasting: { color: palette.goldDark, fontSize: 12, fontWeight: '800' },
  editorialSource: { color: palette.muted, fontSize: 11, fontStyle: 'italic', lineHeight: 16 },
  loading: { alignItems: 'center', gap: 8, paddingVertical: 38 },
  loadingText: { color: palette.muted, fontSize: 14 },
  noticeCard: { backgroundColor: palette.blueSoft, borderColor: palette.blueSoft, padding: 13, gap: 6 },
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
    padding: 12,
  },
  liveHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  liveCross: { color: palette.goldDark, fontSize: 22, fontWeight: '800' },
  liveFlex: { flex: 1, gap: 3 },
  liveTitle: { color: palette.ink, fontSize: 17, fontWeight: '800' },
  liveSubtitle: { color: palette.muted, fontSize: 14, lineHeight: 18, flexShrink: 1 },
  liveLocation: { color: palette.goldDark, fontSize: 12, lineHeight: 17 },
  liveArrow: { color: palette.muted, fontSize: 22, fontWeight: '700' },
  pressed: { opacity: 0.75 },
});
