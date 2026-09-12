-- Remove legacy Moldova 2026 calendar rows that were generated from
-- assumptions instead of complete official jurisdiction calendars.
--
-- This intentionally clears both Moldova calendar codes for 2026 so the
-- official Basarabia and Chișinău calendars can be reseeded independently.

delete from public.calendar_days
where country_code = 'MD'
  and calendar_code in ('md-basarabia', 'md-chisinau')
  and calendar_date >= '2026-01-01'
  and calendar_date <= '2026-12-31';
