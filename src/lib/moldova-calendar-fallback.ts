import mdBasarabiaCalendar2026 from '@/data/md-calendar-2026.json';
import mdChisinauCalendar2026 from '@/data/md-chisinau-calendar-2026.json';
import type { CalendarCode } from '@/i18n/config';
import { classifyFeastRank } from '@/lib/feast-rank';

type MoldovaCalendarEntry = {
  calendar_date: string;
  feast_rank: string | null;
  saints: string[];
  title: string;
  details: string | null;
  fasting_note: string | null;
  editorial_source: string | null;
};

/**
 * Entry shape shared with the screen-level calendar types. The bundled JSON is
 * generated from the seeds and stores only the legacy `feast_rank` literal, so
 * the canonical code is derived on read instead of duplicating it in 730 rows of
 * static data.
 */
export type MoldovaCalendarEntryNormalized = MoldovaCalendarEntry & {
  feast_rank_code: string | null;
};

function toNormalizedEntry(entry: MoldovaCalendarEntry): MoldovaCalendarEntryNormalized {
  return { ...entry, feast_rank_code: classifyFeastRank(entry.feast_rank) };
}

const MOLDOVA_CALENDAR_CODES: CalendarCode[] = ['md-basarabia', 'md-chisinau'];

function isMoldovaCalendar(calendarCode: CalendarCode | null): calendarCode is CalendarCode {
  return Boolean(calendarCode && MOLDOVA_CALENDAR_CODES.includes(calendarCode));
}

function getMoldovaCalendarData(calendarCode: CalendarCode | null): MoldovaCalendarEntry[] {
  if (calendarCode === 'md-basarabia') return mdBasarabiaCalendar2026 as MoldovaCalendarEntry[];
  if (calendarCode === 'md-chisinau') return mdChisinauCalendar2026 as MoldovaCalendarEntry[];
  return [];
}

export function getMoldovaCalendarFallbackRange(
  calendarCode: CalendarCode | null,
  startDate: string,
  endDate: string,
): MoldovaCalendarEntryNormalized[] {
  if (!isMoldovaCalendar(calendarCode)) return [];

  return getMoldovaCalendarData(calendarCode)
    .filter((entry) => (
      entry.calendar_date >= startDate && entry.calendar_date <= endDate
    ))
    .map(toNormalizedEntry);
}

export function getMoldovaCalendarFallbackDay(
  calendarCode: CalendarCode | null,
  date: string,
): MoldovaCalendarEntryNormalized | null {
  return getMoldovaCalendarFallbackRange(calendarCode, date, date)[0] ?? null;
}

export function hasMoldovaCalendarFallback(calendarCode: CalendarCode | null): boolean {
  return isMoldovaCalendar(calendarCode);
}
