export const NOTIFICATION_SEND_WINDOW_MINUTES = 5;

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
