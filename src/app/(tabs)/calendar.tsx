import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, PageHeader, PrimaryButton, Screen, SectionTitle } from '@/components/mvp-ui';
import { palette } from '@/constants/palette';
import { dateKeyInTimeZone } from '@/i18n/config';
import { supabase } from '@/lib/supabase';
import { useLocalization } from '@/providers/localization-provider';

type CalendarEntry = {
  calendar_date: string;
  feast_rank: string | null;
  saints: string[];
  title: string;
  details: string | null;
  fasting_note: string | null;
  editorial_source: string | null;
};

function toDateKey(year: number, monthIndex: number, day: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export default function CalendarScreen() {
  const { calendar, calendarCode, countryCode, region, t } = useLocalization();
  const weekdays = [t('calendar.weekdayLu'), t('calendar.weekdayMa'), t('calendar.weekdayMi'), t('calendar.weekdayJo'), t('calendar.weekdayVi'), t('calendar.weekdaySa'), t('calendar.weekdayDu')];
  const today = useMemo(() => new Date(), []);
  const currentDateKey = useMemo(() => dateKeyInTimeZone(today, region.timeZone), [region.timeZone, today]);
  const [monthOffset, setMonthOffset] = useState(0);
  const calendarView = useMemo(() => {
    const [year, monthNumber, currentDay] = currentDateKey.split('-').map(Number);
    const viewedMonth = new Date(year, monthNumber - 1 + monthOffset, 1);
    const viewedYear = viewedMonth.getFullYear();
    const monthIndex = viewedMonth.getMonth();
    const daysInMonth = new Date(viewedYear, monthIndex + 1, 0).getDate();
    const leadingEmptyDays = (new Date(viewedYear, monthIndex, 1).getDay() + 6) % 7;

    return {
      currentDay: monthOffset === 0 ? currentDay : 1,
      gridCells: [
        ...Array.from({ length: leadingEmptyDays }, () => null),
        ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
      ] as (number | null)[],
      month: new Intl.DateTimeFormat(region.locale, {
        month: 'long',
        timeZone: region.timeZone,
        year: 'numeric',
      }).format(viewedMonth),
      monthEnd: toDateKey(viewedYear, monthIndex, daysInMonth),
      monthIndex,
      monthStart: toDateKey(viewedYear, monthIndex, 1),
      year: viewedYear,
    };
  }, [currentDateKey, monthOffset, region.locale, region.timeZone]);
  const selectionKey = `${countryCode}:${calendarCode ?? 'neales'}`;
  const viewSelectionKey = `${selectionKey}:${calendarView.monthStart}`;
  const [selection, setSelection] = useState({ key: viewSelectionKey, day: calendarView.currentDay });
  const selectedDay = selection.key === viewSelectionKey ? selection.day : calendarView.currentDay;
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const calendarRequestRef = useRef(0);
  const loadCalendar = useCallback(async () => {
    const requestId = ++calendarRequestRef.current;
    setIsLoading(true);
    setErrorMessage('');

    if (countryCode === 'MD') {
      setEntries([]);
      setIsLoading(false);
      return;
    }

    if (!calendarCode) {
      setEntries([]);
      setIsLoading(false);
      return;
    }

    try {
      let { data, error } = await supabase
        .from('calendar_days')
        .select('calendar_date, feast_rank, saints, title, details, fasting_note, editorial_source')
        .eq('country_code', countryCode)
        .eq('language_code', region.languageCode)
        .eq('calendar_code', calendarCode)
        .eq('is_published', true)
        .gte('calendar_date', calendarView.monthStart)
        .lte('calendar_date', calendarView.monthEnd)
        .order('calendar_date', { ascending: true });

      const localizationSchemaMissing = error?.code === '42703'
        || Boolean(error?.message.match(/(country_code|language_code|calendar_code).*does not exist/i));

      if (localizationSchemaMissing && countryCode === 'RO') {
        const legacyResult = await supabase
          .from('calendar_days')
          .select('calendar_date, feast_rank, saints, title, details, fasting_note, editorial_source')
          .eq('is_published', true)
          .gte('calendar_date', calendarView.monthStart)
          .lte('calendar_date', calendarView.monthEnd)
          .order('calendar_date', { ascending: true });
        data = legacyResult.data;
        error = legacyResult.error;
      } else if (localizationSchemaMissing) {
        data = [];
        error = null;
      }

      if (error) {
        if (calendarRequestRef.current !== requestId) return;
        setEntries([]);
        setErrorMessage(t('calendar.loadError'));
      } else {
        if (calendarRequestRef.current !== requestId) return;
        setEntries(data ?? []);
      }
    } catch {
      if (calendarRequestRef.current !== requestId) return;
      setEntries([]);
      setErrorMessage(t('calendar.loadError'));
    } finally {
      if (calendarRequestRef.current === requestId) {
        setIsLoading(false);
      }
    }
  }, [calendarCode, calendarView, countryCode, region.languageCode, t]);

  useEffect(() => {
    const timeoutId = setTimeout(() => void loadCalendar(), 0);
    return () => {
      clearTimeout(timeoutId);
      calendarRequestRef.current += 1;
    };
  }, [loadCalendar]);

  const selectedDateKey = toDateKey(calendarView.year, calendarView.monthIndex, selectedDay);
  const selectedEntry = entries.find((entry) => entry.calendar_date === selectedDateKey) ?? null;
  const entriesByDate = new Map(entries.map((entry) => [entry.calendar_date, entry]));

  return (
    <Screen>
      <PageHeader
        eyebrow={t('calendar.eyebrow')}
        title={t('calendar.title')}
        subtitle={calendar ? calendar.label : t('calendar.subtitleFallback')}
      />
      {countryCode === 'MD' ? (
        <Card style={styles.chooseCalendarCard}>
          <Text style={styles.chooseCalendarTitle}>{t('calendar.unavailableTitle')}</Text>
          <Text style={styles.note}>{t('calendar.moldovaUnavailable')}</Text>
        </Card>
      ) : !calendarCode ? (
        <Card style={styles.chooseCalendarCard}>
          <Text style={styles.chooseCalendarTitle}>{t('account.calendarRequired')}</Text>
          <Text style={styles.note}>{t('account.calendarDescription')}</Text>
          <PrimaryButton label={t('common.chooseCalendar')} onPress={() => router.push('/account')} />
        </Card>
      ) : null}
      {countryCode !== 'MD' ? (
        <>
      {errorMessage ? (
        <Card style={styles.errorCard}>
          <Text style={styles.errorText}>{errorMessage}</Text>
          <Pressable accessibilityRole="button" onPress={() => void loadCalendar()}>
            <Text style={styles.retry}>{t('common.retry')}</Text>
          </Pressable>
        </Card>
      ) : null}
      <Card>
        <View style={styles.monthHeader}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('calendar.previousMonth')} onPress={() => setMonthOffset((value) => value - 1)} style={styles.monthButton}>
            <Text style={styles.monthButtonText}>‹</Text>
          </Pressable>
          <Text style={styles.month}>{calendarView.month}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={t('calendar.nextMonth')} onPress={() => setMonthOffset((value) => value + 1)} style={styles.monthButton}>
            <Text style={styles.monthButtonText}>›</Text>
          </Pressable>
        </View>
        {monthOffset !== 0 ? <Pressable accessibilityRole="button" onPress={() => setMonthOffset(0)}><Text style={styles.todayLink}>{t('calendar.backToCurrentMonth')}</Text></Pressable> : null}
        <View style={styles.legend}>
          <Text style={styles.legendItem}><Text style={styles.redCross}>✝</Text> {t('calendar.redCrossLegend')}</Text>
          <Text style={styles.legendItem}><Text style={styles.blackCross}>✝</Text> {t('calendar.documentedDayLegend')}</Text>
        </View>
        <View style={styles.grid}>{weekdays.map((day) => <Text key={day} style={styles.weekday}>{day}</Text>)}</View>
        {isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={palette.blue} />
            <Text style={styles.note}>{t('calendar.loading')}</Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {calendarView.gridCells.map((day, index) => day === null ? (
              <View key={`empty-${index}`} style={styles.day} />
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${t('calendar.selectDay')} ${day}`}
                key={day}
                onPress={() => setSelection({ key: viewSelectionKey, day })}
                style={[styles.day, selectedDay === day && styles.selectedDay]}>
                <Text style={[styles.dayText, index % 7 === 6 && styles.sundayText, selectedDay === day && styles.selectedDayText]}>{day}</Text>
                {(() => {
                  const dateKey = toDateKey(calendarView.year, calendarView.monthIndex, day);
                  const entry = entriesByDate.get(dateKey);
                  if (!entry) return null;
                  const isRedCross = ['red-cross', 'red_cross', 'cruce roșie', 'cruce rosie'].some((marker) => entry.feast_rank?.toLowerCase().includes(marker));
                  const primaryFeast = entry.title.split(';')[0].trim();
                  return <View style={styles.dayDetails}>
                    <Text style={[styles.crossMarker, isRedCross ? styles.redCross : styles.blackCross, selectedDay === day && styles.markerSelected]}>✝</Text>
                    <Text numberOfLines={2} ellipsizeMode="tail" style={[styles.dayCaption, selectedDay === day && styles.captionSelected]}>{primaryFeast}</Text>
                  </View>;
                })()}
              </Pressable>
            ))}
          </View>
        )}
      </Card>
      <SectionTitle>{selectedDay} {calendarView.month}</SectionTitle>
      <Card>
        {isLoading ? (
          <Text style={styles.note}>{t('calendar.loadingDay')}</Text>
        ) : selectedEntry ? (
          <>
            <Text style={styles.rank}>{selectedEntry.feast_rank ?? t('calendar.feastRankFallback')}</Text>
            <Text style={styles.feast}>{selectedEntry.title}</Text>
            {selectedEntry.saints.length > 0 ? <Text style={styles.saints}>{selectedEntry.saints.join('\n')}</Text> : null}
            {selectedEntry.details ? <Text style={styles.note}>{selectedEntry.details}</Text> : null}
            {selectedEntry.fasting_note ? <Text style={styles.fasting}>{selectedEntry.fasting_note}</Text> : null}
            {selectedEntry.editorial_source ? <Text style={styles.source}>{selectedEntry.editorial_source}</Text> : null}
          </>
        ) : (
          <Text style={styles.note}>{t('calendar.emptyDay')}</Text>
        )}
      </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  month: { color: palette.ink, fontSize: 19, fontWeight: '800', textTransform: 'capitalize', textAlign: 'center', marginBottom: 8 },
  monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: palette.blueSoft, alignItems: 'center', justifyContent: 'center' },
  monthButtonText: { color: palette.blue, fontSize: 26, lineHeight: 28 },
  todayLink: { color: palette.blue, textAlign: 'center', fontSize: 12, fontWeight: '700', marginBottom: 8 },
  legend: { gap: 4, marginBottom: 8 },
  legendItem: { color: palette.muted, fontSize: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: '14.285%', textAlign: 'center', color: palette.muted, fontSize: 12, fontWeight: '700', paddingVertical: 8 },
  day: { width: '14.285%', height: 72, alignItems: 'center', justifyContent: 'flex-start', borderRadius: 10, position: 'relative', paddingHorizontal: 2, paddingTop: 5, overflow: 'hidden' },
  dayText: { color: palette.ink, fontSize: 14 },
  selectedDay: { backgroundColor: palette.blue },
  selectedDayText: { color: '#FFFFFF', fontWeight: '800' },
  sundayText: { color: '#C24141', fontWeight: '800' },
  dot: { position: 'absolute', bottom: 5, width: 4, height: 4, borderRadius: 2, backgroundColor: palette.goldDark },
  dotSelected: { backgroundColor: palette.gold },
  dayDetails: { width: '100%', alignItems: 'center', overflow: 'hidden', flexShrink: 1 },
  crossMarker: { fontSize: 9, lineHeight: 11, fontWeight: '800' },
  redCross: { color: '#C24141' },
  blackCross: { color: palette.ink },
  markerSelected: { color: '#FFFFFF' },
  dayCaption: { width: '100%', color: palette.muted, fontSize: 7, lineHeight: 9, textAlign: 'center', paddingHorizontal: 1, overflow: 'hidden' },
  captionSelected: { color: '#FFFFFF' },
  rank: { color: palette.goldDark, fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  feast: { color: palette.ink, fontSize: 17, lineHeight: 24, fontWeight: '800' },
  saints: { color: palette.ink, fontSize: 14, lineHeight: 22 },
  note: { color: palette.muted, fontSize: 13, lineHeight: 19 },
  fasting: { color: palette.goldDark, fontSize: 13, fontWeight: '800' },
  source: { color: palette.muted, fontSize: 11, fontStyle: 'italic', lineHeight: 16 },
  loading: { alignItems: 'center', gap: 8, paddingVertical: 32 },
  chooseCalendarCard: { backgroundColor: palette.blueSoft, borderColor: palette.blueSoft },
  chooseCalendarTitle: { color: palette.blue, fontSize: 15, fontWeight: '800' },
  errorCard: { borderColor: palette.danger },
  errorText: { color: palette.danger, fontSize: 14, lineHeight: 20 },
  retry: { color: palette.blue, fontWeight: '800' },
});
