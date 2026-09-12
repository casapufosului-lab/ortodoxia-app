import mdBasarabiaCalendar2026 from '@/data/md-calendar-2026.json';
import mdChisinauCalendar2026 from '@/data/md-chisinau-calendar-2026.json';
import type { CalendarCode } from '@/i18n/config';

type MoldovaCalendarEntry = {
  calendar_date: string;
  feast_rank: string | null;
  saints: string[];
  title: string;
  details: string | null;
  fasting_note: string | null;
  editorial_source: string | null;
};

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
): MoldovaCalendarEntry[] {
  if (!isMoldovaCalendar(calendarCode)) return [];

  return getMoldovaCalendarData(calendarCode).filter((entry) => (
    entry.calendar_date >= startDate && entry.calendar_date <= endDate
  ));
}

export function getMoldovaCalendarFallbackDay(
  calendarCode: CalendarCode | null,
  date: string,
): MoldovaCalendarEntry | null {
  return getMoldovaCalendarFallbackRange(calendarCode, date, date)[0] ?? null;
}

export function hasMoldovaCalendarFallback(calendarCode: CalendarCode | null): boolean {
  return isMoldovaCalendar(calendarCode);
}
