import type { CalendarEvent } from '@/src/entities/calendar/types';
import {
  parseCalendarClockMinutes,
  parseCalendarTimeShift,
} from '@/src/features/agent/calendarIntelligence/calendarClockParser';
import { logUpdateMatch, logUpdateRequest } from '@/src/features/agent/calendarIntelligence/calendarReadDiagnostics';
import { normalizeCalendarEvents } from '@/src/features/agent/calendarIntelligence/normalizeEvents';
import { resolveTargetDayContext } from '@/src/features/agent/calendarIntelligence/resolveTargetDay';
import {
  getEventsActiveAtTime,
  getEventsStartingAtTime,
} from '@/src/features/agent/calendarIntelligence/scheduleHelpers';
import type { NormalizedCalendarEvent } from '@/src/features/agent/calendarIntelligence/types';
import { getLastCalendarReadMatch } from '@/src/features/agent/execution/calendarExecutionSession';

function normalizeMatchText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function tokenize(value: string) {
  return normalizeMatchText(value)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 2);
}

function scoreTitleMatch(titleQuery: string, eventTitle: string) {
  const queryNorm = normalizeMatchText(titleQuery);

  if (!queryNorm) {
    return 0;
  }

  const eventNorm = normalizeMatchText(eventTitle);

  if (eventNorm === queryNorm) {
    return 100;
  }

  if (eventNorm.includes(queryNorm) || queryNorm.includes(eventNorm)) {
    return 80;
  }

  const queryTokens = tokenize(queryNorm);
  const eventTokens = new Set(tokenize(eventNorm));
  const overlap = queryTokens.filter((token) => eventTokens.has(token)).length;

  return overlap > 0 ? Math.round((overlap / queryTokens.length) * 70) : 0;
}

function pickBestNormalizedMatch(
  candidates: NormalizedCalendarEvent[],
  titleQuery: string,
): NormalizedCalendarEvent | null {
  if (candidates.length === 0) {
    return null;
  }

  const queryNorm = normalizeMatchText(titleQuery);

  if (!queryNorm) {
    return candidates.length === 1 ? candidates[0] : null;
  }

  const ranked = candidates
    .map((event) => ({
      event,
      score: scoreTitleMatch(titleQuery, event.title),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.event ?? null;
}

function formatClockLabel(minutes: number) {
  const pad = (value: number) => String(value).padStart(2, '0');

  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

function tryPinnedReadMatch(params: {
  events: CalendarEvent[];
  titleQuery: string;
  clockMinutes: number;
}) {
  const pinned = getLastCalendarReadMatch();

  if (!pinned || pinned.clockMinutes !== params.clockMinutes) {
    return null;
  }

  if (params.titleQuery && scoreTitleMatch(params.titleQuery, pinned.title) <= 0) {
    return null;
  }

  const match = params.events.find((event) => event.id === pinned.eventId) ?? null;

  if (!match) {
    return null;
  }

  return { match, source: 'pinned_read' as const };
}

export function findCalendarEventAtTimeFromEvents(params: {
  events: CalendarEvent[];
  transcript: string;
  referenceNow: Date;
  titleQuery?: string;
  clockMinutes?: number;
  timeZone?: string;
  matchMode?: 'starting_at_time' | 'active_at_time';
}): {
  match: CalendarEvent | null;
  titleQuery: string;
  clockMinutes: number | null;
  candidates: CalendarEvent[];
  matchSource: 'pinned_read' | 'starting_at_time' | 'title_rank' | 'none';
} {
  const timeZone = params.timeZone ?? resolveTargetDayContext(params.transcript, params.referenceNow).timezone;
  const day = resolveTargetDayContext(params.transcript, params.referenceNow, timeZone);
  const titleQuery = params.titleQuery?.trim() ?? '';
  const clockMinutes =
    params.clockMinutes ??
    parseCalendarClockMinutes(params.transcript, day) ??
    null;

  if (clockMinutes === null) {
    return { match: null, titleQuery, clockMinutes, candidates: [], matchSource: 'none' };
  }

  const pinned = tryPinnedReadMatch({ events: params.events, titleQuery, clockMinutes });

  if (pinned) {
    return {
      match: pinned.match,
      titleQuery,
      clockMinutes,
      candidates: [pinned.match],
      matchSource: pinned.source,
    };
  }

  const normalized = normalizeCalendarEvents(params.events, timeZone);
  const atTimeNormalized =
    params.matchMode === 'active_at_time'
      ? getEventsActiveAtTime(normalized, day, clockMinutes)
      : getEventsStartingAtTime(normalized, day, clockMinutes);

  let selected: NormalizedCalendarEvent | null = pickBestNormalizedMatch(
    atTimeNormalized,
    titleQuery,
  );

  if (!selected && !titleQuery && atTimeNormalized.length === 1) {
    selected = atTimeNormalized[0];
  }

  const candidateIds = new Set(
    (titleQuery
      ? atTimeNormalized.filter((event) => scoreTitleMatch(titleQuery, event.title) > 0)
      : atTimeNormalized
    ).map((event) => event.id),
  );

  const candidates = params.events.filter((event) => candidateIds.has(event.id));
  const match = selected ? params.events.find((event) => event.id === selected.id) ?? null : null;

  return {
    match,
    titleQuery,
    clockMinutes,
    candidates,
    matchSource: match ? 'starting_at_time' : 'none',
  };
}

export function findCalendarEventForUpdateFromEvents(params: {
  transcript: string;
  referenceNow: Date;
  events: CalendarEvent[];
  titleQuery: string;
  timeZone?: string;
}): {
  match: CalendarEvent | null;
  titleQuery: string;
  clockMinutes: number | null;
  candidates: CalendarEvent[];
  fromMs: number | null;
  toMs: number | null;
  matchSource: 'pinned_read' | 'starting_at_time' | 'title_rank' | 'none';
} {
  const timeZone = params.timeZone ?? resolveTargetDayContext(params.transcript, params.referenceNow).timezone;
  const shift = parseCalendarTimeShift(params.transcript, params.referenceNow, timeZone);

  if (!shift.ok) {
    return {
      match: null,
      titleQuery: params.titleQuery,
      clockMinutes: null,
      candidates: [],
      fromMs: null,
      toMs: null,
      matchSource: 'none',
    };
  }

  logUpdateRequest({
    transcript: params.transcript,
    titleQuery: params.titleQuery,
    fromTime: formatClockLabel(shift.fromMinutes),
    toTime: formatClockLabel(shift.toMinutes),
    pinnedEventId: getLastCalendarReadMatch()?.eventId ?? null,
  });

  const resolved = findCalendarEventAtTimeFromEvents({
    events: params.events,
    transcript: params.transcript,
    referenceNow: params.referenceNow,
    titleQuery: params.titleQuery,
    clockMinutes: shift.fromMinutes,
    timeZone,
    matchMode: 'starting_at_time',
  });

  logUpdateMatch({
    titleQuery: params.titleQuery,
    fromTime: formatClockLabel(shift.fromMinutes),
    match: resolved.match,
    source: resolved.matchSource,
    candidateCount: resolved.candidates.length,
  });

  return {
    ...resolved,
    fromMs: shift.fromMs,
    toMs: shift.toMs,
  };
}
