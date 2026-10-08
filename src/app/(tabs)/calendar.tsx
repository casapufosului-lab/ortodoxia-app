import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, PageHeader, PrimaryButton, Screen, SectionTitle } from '@/components/mvp-ui';
import { palette } from '@/constants/palette';
import { dateKeyInTimeZone } from '@/i18n/config';
import {
  feastRankLabelKey,
  isCalendarRpcUnavailable,
  isMajorFeast,
  isMonthInSeededRange,
  isSundayDateKey,
  resolveFeastRankCode,
} from '@/lib/feast-rank';
import { calendarDisplayName } from '@/lib/calendar-labels';
import { displayableSource } from '@/lib/content-source';
import { getMoldovaCalendarFallbackRange, hasMoldovaCalendarFallback } from '@/lib/moldova-calendar-fallback';
import { supabase } from '@/lib/supabase';
import { useLocalization } from '@/providers/localization-provider';

type CalendarEntry = {
  calendar_date: string;
  feast_rank: string | null;
  feast_rank_code: string | null;
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
  const { availableCalendars, calendar, calendarCode, countryCode, languageCode, region, setCalendarCode, t } = useLocalization();
  // The user's chosen language drives the calendar query. get_calendar_days_localized
  // returns the native row when no translation exists, so there is no need to
  // downgrade to English (which previously discarded a valid selection).
  const calendarLanguageCode = languageCode;
  const weekdays = [t('calendar.weekdayLu'), t('calendar.weekdayMa'), t('calendar.weekdayMi'), t('calendar.weekdayJo'), t('calendar.weekdayVi'), t('calendar.weekdaySa'), t('calendar.weekdayDu')];
  const [today, setToday] = useState(() => new Date());
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
      month: new Intl.DateTimeFormat(languageCode, {
        month: 'long',
        timeZone: 'UTC',
        year: 'numeric',
      }).format(new Date(Date.UTC(viewedYear, monthIndex, 1))),
      monthEnd: toDateKey(viewedYear, monthIndex, daysInMonth),
      monthIndex,
      monthStart: toDateKey(viewedYear, monthIndex, 1),
      year: viewedYear,
    };
  }, [currentDateKey, languageCode, monthOffset]);
  const selectionKey = `${countryCode}:${calendarCode ?? 'neales'}`;
  const viewSelectionKey = `${selectionKey}:${calendarView.monthStart}`;
  const [selection, setSelection] = useState({ key: viewSelectionKey, day: calendarView.currentDay });
  const selectedDay = selection.key === viewSelectionKey ? selection.day : calendarView.currentDay;
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const calendarRequestRef = useRef(0);

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
  const loadCalendar = useCallback(async () => {
    const requestId = ++calendarRequestRef.current;
    setIsLoading(true);
    setErrorMessage('');

    if (!calendarCode) {
      setEntries([]);
      setIsLoading(false);
      return;
    }

    try {
      if (hasMoldovaCalendarFallback(calendarCode)) {
        setEntries(getMoldovaCalendarFallbackRange(calendarCode, calendarView.monthStart, calendarView.monthEnd));
        return;
      }

      let { data, error } = await supabase.rpc('get_calendar_days_localized', {
        p_country_code: countryCode,
        p_calendar_code: calendarCode,
        p_language_code: calendarLanguageCode,
        p_start_date: calendarView.monthStart,
        p_end_date: calendarView.monthEnd,
      });

      const localizationRpcMissing = isCalendarRpcUnavailable(error);

      if (localizationRpcMissing) {
        const legacyResult = await supabase
          .from('calendar_days')
          .select('calendar_date, feast_rank, feast_rank_code, saints, title, details, fasting_note, editorial_source')
          .eq('country_code', countryCode)
          .eq('language_code', region.languageCode)
          .eq('calendar_code', calendarCode)
          .eq('is_published', true)
          .gte('calendar_date', calendarView.monthStart)
          .lte('calendar_date', calendarView.monthEnd)
          .order('calendar_date', { ascending: true });
        data = legacyResult.data;
        error = legacyResult.error;
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
  }, [calendarCode, calendarLanguageCode, calendarView, countryCode, region.languageCode, t]);

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
  // Localized rank label for the selected day. The canonical code decides the
  // wording; unknown ranks fall back to the neutral "commemoration" copy rather
  // than echoing a foreign-language literal.
  const selectedRankLabelKey = selectedEntry
    ? feastRankLabelKey(resolveFeastRankCode(selectedEntry.feast_rank_code, selectedEntry.feast_rank))
    : null;

  // Month navigation is bounded by the seeded calendar range. Stepping past it
  // cannot produce data, so the arrows are disabled rather than leading the user
  // into an empty grid.
  const monthKeyFor = (offset: number) => {
    const [year, monthNumber] = currentDateKey.split('-').map(Number);
    const shifted = new Date(year, monthNumber - 1 + offset, 1);
    return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}`;
  };
  const canGoToPreviousMonth = isMonthInSeededRange(monthKeyFor(monthOffset - 1));
  const canGoToNextMonth = isMonthInSeededRange(monthKeyFor(monthOffset + 1));

  return (
    <Screen>
      <PageHeader
        eyebrow={t('calendar.eyebrow')}
        title={t('calendar.title')}
        subtitle={calendar ? calendarDisplayName(calendar.calendarCode, calendar.label, t) : t('calendar.subtitleFallback')}
      />
      {countryCode === 'MD' ? (
        <Card style={styles.chooseCalendarCard}>
          <Text style={styles.chooseCalendarTitle}>{t('account.calendar')}</Text>
          <Text style={styles.note}>{t('account.calendarDescription')}</Text>
          <View style={styles.calendarOptions}>
            {availableCalendars.map((option) => {
              const isSelected = option.calendarCode === calendarCode;
              return (
                <Pressable
                  accessibilityLabel={`${t('account.chooseCalendarAccessibility')} ${calendarDisplayName(option.calendarCode, option.label, t)}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  key={option.calendarCode}
                  onPress={() => void setCalendarCode(option.calendarCode)}
                  style={[styles.calendarOption, isSelected && styles.calendarOptionSelected]}>
                  <Text style={[styles.calendarOptionTitle, isSelected && styles.calendarOptionTitleSelected]}>{calendarDisplayName(option.calendarCode, option.label, t)}</Text>
                  <Text style={[styles.calendarOptionMeta, isSelected && styles.calendarOptionMetaSelected]}>{calendarDisplayName(option.calendarCode, option.jurisdictionLabel, t)}</Text>
                </Pressable>
              );
            })}
          </View>
        </Card>
      ) : !calendarCode ? (
        <Card style={styles.chooseCalendarCard}>
          <Text style={styles.chooseCalendarTitle}>{t('account.calendarRequired')}</Text>
          <Text style={styles.note}>{t('account.calendarDescription')}</Text>
          <PrimaryButton label={t('common.chooseCalendar')} onPress={() => router.push('/account')} />
        </Card>
      ) : null}
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('calendar.previousMonth')}
            accessibilityState={{ disabled: !canGoToPreviousMonth }}
            disabled={!canGoToPreviousMonth}
            onPress={() => setMonthOffset((value) => value - 1)}
            style={[styles.monthButton, !canGoToPreviousMonth && styles.monthButtonDisabled]}
          >
            <Text style={styles.monthButtonText}>‹</Text>
          </Pressable>
          <Text style={styles.month}>{calendarView.month}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('calendar.nextMonth')}
            accessibilityState={{ disabled: !canGoToNextMonth }}
            disabled={!canGoToNextMonth}
            onPress={() => setMonthOffset((value) => value + 1)}
            style={[styles.monthButton, !canGoToNextMonth && styles.monthButtonDisabled]}
          >
            <Text style={styles.monthButtonText}>›</Text>
          </Pressable>
        </View>
        {monthOffset !== 0 ? <Pressable accessibilityRole="button" onPress={() => setMonthOffset(0)}><Text style={styles.todayLink}>{t('calendar.backToCurrentMonth')}</Text></Pressable> : null}
        {/* Outside the seeded range the backend has no rows by design (the next
            year's liturgical calendar is not published yet), so say so instead of
            rendering an unexplained empty grid. */}
        {!isMonthInSeededRange(calendarView.monthStart.slice(0, 7)) ? (
          <Text style={styles.note}>{t('calendar.monthOutsideCoverage')}</Text>
        ) : null}
        <View style={styles.legend}>
          <Text style={styles.legendItem}><Text style={styles.redCross}>✝</Text> {t((countryCode === 'GR' || countryCode === 'CY') ? 'calendar.majorFeastLegend' : 'calendar.redCrossLegend')}</Text>
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
                {(() => {
                  const dateKey = toDateKey(calendarView.year, calendarView.monthIndex, day);
                  const entry = entriesByDate.get(dateKey);
                  // Canonical classification: prefer the backend code, fall back to
                  // classifying the raw literal for offline/bundled calendars.
                  const rankCode = entry
                    ? resolveFeastRankCode(entry.feast_rank_code, entry.feast_rank)
                    : null;
                  // The red calendar mark belongs to major feasts and to Sundays,
                  // computed from the real weekday rather than grid position.
                  const hasRedCalendarMark = isMajorFeast(rankCode) || isSundayDateKey(dateKey);
                  if (!entry) {
                    return <Text style={[styles.dayText, hasRedCalendarMark && styles.sundayText, selectedDay === day && !hasRedCalendarMark && styles.selectedDayText]}>{day}</Text>;
                  }
                  const primaryFeast = entry.title.split(';')[0].trim();
                  return <>
                    <Text style={[styles.dayText, hasRedCalendarMark && styles.sundayText, selectedDay === day && !hasRedCalendarMark && styles.selectedDayText]}>{day}</Text>
                    <View style={styles.dayDetails}>
                      <Text style={[styles.crossMarker, hasRedCalendarMark ? styles.redCross : styles.blackCross, selectedDay === day && !hasRedCalendarMark && styles.markerSelected]}>✝</Text>
                      <Text numberOfLines={2} ellipsizeMode="tail" style={[styles.dayCaption, selectedDay === day && styles.captionSelected]}>{primaryFeast}</Text>
                    </View>
                  </>;
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
            <Text style={styles.rank}>{selectedRankLabelKey ? t(selectedRankLabelKey) : t('calendar.feastRankFallback')}</Text>
            <Text style={styles.feast}>{selectedEntry.title}</Text>
            {selectedEntry.saints.length > 0 ? <Text style={styles.saints}>{selectedEntry.saints.join('\n')}</Text> : null}
            {selectedEntry.details ? <Text style={styles.note}>{selectedEntry.details}</Text> : null}
            {selectedEntry.fasting_note ? <Text style={styles.fasting}>{selectedEntry.fasting_note}</Text> : null}
            {displayableSource(selectedEntry.editorial_source) ? (
              <Text style={styles.source}>{displayableSource(selectedEntry.editorial_source)}</Text>
            ) : null}
          </>
        ) : (
          <Text style={styles.note}>{t('calendar.emptyDay')}</Text>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  month: { color: palette.ink, fontSize: 19, fontWeight: '800', textTransform: 'capitalize', textAlign: 'center', marginBottom: 8 },
  monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // 44pt is the iOS minimum touch target and the Android equivalent guidance; at
  // 36pt the previous/next month arrows were a coin flip for a tremor or big thumb.
  /* Google asks for 48x48dp tap targets; the month arrows were 44 (audit A4). */
  monthButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: palette.blueSoft, alignItems: 'center', justifyContent: 'center' },
  monthButtonDisabled: { opacity: 0.35 },
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
  calendarOptions: { gap: 10 },
  calendarOption: { backgroundColor: palette.paper, borderColor: palette.line, borderWidth: 1, borderRadius: 14, padding: 12, gap: 3 },
  calendarOptionSelected: { backgroundColor: palette.blue, borderColor: palette.blue },
  calendarOptionTitle: { color: palette.ink, fontSize: 14, fontWeight: '800' },
  calendarOptionMeta: { color: palette.muted, fontSize: 12, fontWeight: '700' },
  calendarOptionTitleSelected: { color: '#FFFFFF' },
  calendarOptionMetaSelected: { color: palette.sky },
  errorCard: { borderColor: palette.danger },
  errorText: { color: palette.danger, fontSize: 14, lineHeight: 20 },
  retry: { color: palette.blue, fontWeight: '800' },
});
