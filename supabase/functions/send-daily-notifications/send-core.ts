export const NOTIFICATION_SEND_WINDOW_MINUTES = 5;

/**
 * Canonical feast-rank codes.
 *
 * Mirrors `public.calendar_days.feast_rank_code` (migration
 * 20260915000100_fix_calendar_rpc_and_canonical_feast_rank.sql) and
 * `src/lib/feast-rank.ts`. The Edge Function cannot import from `src/`, so the
 * classifier is duplicated here deliberately and the two copies are kept honest
 * by a test that asserts identical classification over the same fixture set.
 */
export type FeastRankCode =
  | 'red_cross'
  | 'black_cross'
  | 'great_feast'
  | 'theotokos_feast'
  | 'sunday';

const FEAST_RANK_CODES: readonly FeastRankCode[] = [
  'red_cross',
  'black_cross',
  'great_feast',
  'theotokos_feast',
  'sunday',
];

/** Diacritic-insensitive normalization used for legacy-literal matching. */
export function normalizeRankLiteral(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

const LEGACY_RANK_MARKERS: readonly { code: FeastRankCode; markers: readonly string[] }[] = [
  { code: 'red_cross', markers: ['red-cross', 'red_cross', 'redcross', 'cruce rosie'] },
  { code: 'great_feast', markers: ['great feast', 'major feast', 'veliki praznik', 'δεσποτικη εορτη', 'δεσποτικη'] },
  { code: 'theotokos_feast', markers: ['theotokos', 'θεομητορικη εορτη', 'θεομητορικη', 'μεγαλη εορτη', 'богородич'] },
  { code: 'sunday', markers: ['duminica', 'sunday', 'κυριακη', 'недел'] },
  { code: 'black_cross', markers: ['black-cross', 'black_cross', 'blackcross', 'cruce neagra'] },
];

/**
 * Classify a rank that may already be canonical or may be a legacy localized
 * literal. Returns null when unknown, so callers render their own fallback rather
 * than inventing a rank.
 */
export function classifyFeastRank(rawRank: string | null | undefined): FeastRankCode | null {
  if (rawRank == null) return null;
  const trimmed = rawRank.trim();
  if (trimmed.length === 0) return null;
  if ((FEAST_RANK_CODES as readonly string[]).includes(trimmed)) {
    return trimmed as FeastRankCode;
  }
  const normalized = normalizeRankLiteral(trimmed);
  for (const { code, markers } of LEGACY_RANK_MARKERS) {
    if (markers.some((marker) => normalized.includes(marker))) return code;
  }
  return null;
}

/** Resolve the canonical code, preferring the backend value. */
export function resolveFeastRankCode(
  canonicalCode: string | null | undefined,
  rawRank: string | null | undefined,
): FeastRankCode | null {
  if (canonicalCode && (FEAST_RANK_CODES as readonly string[]).includes(canonicalCode)) {
    return canonicalCode as FeastRankCode;
  }
  return classifyFeastRank(rawRank);
}

function parseTimeToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value.slice(0, 5));
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  return hour * 60 + minute;
}

export function isNotificationDue(
  configuredTime: string,
  localTime: string,
  windowMinutes = NOTIFICATION_SEND_WINDOW_MINUTES,
): boolean {
  const configured = parseTimeToMinutes(configuredTime);
  const local = parseTimeToMinutes(localTime);
  if (configured === null || local === null) return false;

  const delta = local - configured;
  return delta >= 0 && delta <= windowMinutes;
}

type ExpoPushTicket = {
  status?: unknown;
  id?: unknown;
  details?: { error?: unknown } | null;
};

export type ExpoTicketClassification = {
  acceptedIndexes: number[];
  retryIndexes: number[];
  deactivateIndexes: number[];
  ambiguousIndexes: number[];
};

export function classifyExpoPushTickets(
  payload: unknown,
  expectedCount: number,
): ExpoTicketClassification | null {
  if (!payload || typeof payload !== 'object') return null;

  const rawData = (payload as { data?: unknown }).data;
  const data = Array.isArray(rawData)
    ? rawData
    : expectedCount === 1 && rawData && typeof rawData === 'object'
      ? [rawData]
      : null;
  if (!data || data.length !== expectedCount) return null;

  const acceptedIndexes: number[] = [];
  const retryIndexes: number[] = [];
  const deactivateIndexes: number[] = [];
  const ambiguousIndexes: number[] = [];

  data.forEach((rawTicket, index) => {
    if (!rawTicket || typeof rawTicket !== 'object') {
      ambiguousIndexes.push(index);
      return;
    }

    const ticket = rawTicket as ExpoPushTicket;
    if (ticket.status === 'ok' && typeof ticket.id === 'string' && ticket.id.length > 0) {
      acceptedIndexes.push(index);
      return;
    }

    if (ticket.status === 'ok') {
      ambiguousIndexes.push(index);
      return;
    }

    if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
      deactivateIndexes.push(index);
      return;
    }

    if (ticket.status === 'error') {
      retryIndexes.push(index);
      return;
    }

    ambiguousIndexes.push(index);
  });

  return { acceptedIndexes, retryIndexes, deactivateIndexes, ambiguousIndexes };
}
