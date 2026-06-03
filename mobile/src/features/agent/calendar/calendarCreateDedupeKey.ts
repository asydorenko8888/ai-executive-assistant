import { getExecutiveCalendarTimezone, getZonedTimeParts } from '@/src/features/agent/calendar/calendarTimezone';

export function normalizeCalendarCreateTitle(title: string) {
  return title
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[«»"']/g, '');
}

export function buildCalendarCreateDedupeKey(params: {
  title: string;
  startMs: number;
  timeZone?: string;
}) {
  const timeZone = params.timeZone ?? getExecutiveCalendarTimezone();
  const title = normalizeCalendarCreateTitle(params.title);
  const parts = getZonedTimeParts(new Date(params.startMs), timeZone);
  const dateKey = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
  const startTime = `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;

  return ['create', title, dateKey, startTime, timeZone].join('|');
}

export function logCalendarCreateDedupeDecision(params: {
  dedupeKey: string;
  allowed: boolean;
  reason: string;
  createInFlightDedupeKey?: string | null;
  lastCreateDedupeKey?: string | null;
  createRetryCount?: number;
}) {
  console.log('[Calendar Create Dedupe]', {
    dedupeKey: params.dedupeKey,
    allowed: params.allowed,
    reason: params.reason,
    createInFlightDedupeKey: params.createInFlightDedupeKey ?? null,
    lastCreateDedupeKey: params.lastCreateDedupeKey ?? null,
    createRetryCount: params.createRetryCount ?? 0,
    at: new Date().toISOString(),
  });
}
