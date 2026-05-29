import type { CalendarEvent } from '@/src/entities/calendar/types';
import {
  parseCalendarClockMinutes,
} from '@/src/features/agent/calendarIntelligence/calendarClockParser';
import { parseCalendarUpdateSchedule, resolveUpdateTargetMs } from '@/src/features/agent/calendar/calendarUpdateScheduleParser';
import { logUpdateMatch, logUpdateRequest } from '@/src/features/agent/calendarIntelligence/calendarReadDiagnostics';
import { logDeleteCandidate, logDeleteNotFoundReason } from '@/src/features/agent/calendar/calendarDeleteDiagnostics';
import { normalizeCalendarEvents } from '@/src/features/agent/calendarIntelligence/normalizeEvents';
import { resolveTargetDayContext } from '@/src/features/agent/calendarIntelligence/resolveTargetDay';
import {
  getEventsActiveAtTime,
  getEventsForDay,
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

function normalizeTitleToken(token: string) {
  let normalized = token;

  if (/^[A-Za-zА-Яа-яЁёІіЇїЄє'-]+у$/u.test(normalized) && normalized.length >= 4) {
    normalized = `${normalized.slice(0, -1)}а`;
  }

  return normalized;
}

function titleTokenStem(token: string) {
  const normalized = normalizeTitleToken(token);

  if (normalized.length >= 6) {
    return normalized.slice(0, 5);
  }

  if (normalized.length >= 4) {
    return normalized.slice(0, 4);
  }

  return normalized;
}

function levenshteinDistance(left: string, right: string) {
  const rows = left.length + 1;
  const cols = right.length + 1;
  const matrix = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

  for (let row = 0; row < rows; row += 1) {
    matrix[row][0] = row;
  }

  for (let col = 0; col < cols; col += 1) {
    matrix[0][col] = col;
  }

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const cost = left[row - 1] === right[col - 1] ? 0 : 1;
      matrix[row][col] = Math.min(
        matrix[row - 1][col] + 1,
        matrix[row][col - 1] + 1,
        matrix[row - 1][col - 1] + cost,
      );
    }
  }

  return matrix[rows - 1][cols - 1];
}

function tokensRoughlyMatch(queryToken: string, eventToken: string) {
  const query = normalizeTitleToken(queryToken);
  const event = normalizeTitleToken(eventToken);

  if (query === event) {
    return true;
  }

  if (query.includes(event) || event.includes(query)) {
    return true;
  }

  const queryStem = titleTokenStem(query);
  const eventStem = titleTokenStem(event);

  if (
    queryStem.length >= 4 &&
    eventStem.length >= 4 &&
    (queryStem.startsWith(eventStem) || eventStem.startsWith(queryStem))
  ) {
    return true;
  }

  if (query.length >= 5 && event.length >= 5) {
    return levenshteinDistance(query, event) <= 2;
  }

  return false;
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
  const eventTokens = tokenize(eventNorm);
  const overlap = queryTokens.filter((token) =>
    eventTokens.some((eventToken) => tokensRoughlyMatch(token, eventToken)),
  ).length;

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

function findUpdateMatchByTitle(params: {
  events: CalendarEvent[];
  titleQuery: string;
  timeZone: string;
  referenceNow: Date;
}) {
  const day = resolveTargetDayContext('сегодня', params.referenceNow, params.timeZone);
  const normalized = normalizeCalendarEvents(params.events, params.timeZone);
  const dayEvents = getEventsForDay(normalized, day);
  const ranked = dayEvents
    .map((event) => ({
      event,
      score: scoreTitleMatch(params.titleQuery, event.title),
    }))
    .filter((entry) => entry.score >= 50)
    .sort((left, right) => right.score - left.score);

  if (ranked.length === 0) {
    return { match: null, candidates: [] as CalendarEvent[] };
  }

  if (ranked.length > 1 && ranked[0].score - ranked[1].score < 10) {
    const strong = ranked.filter((entry) => entry.score >= Math.max(50, ranked[0].score - 5));

    if (strong.length > 1) {
      return {
        match: null,
        candidates: strong.map((entry) => params.events.find((event) => event.id === entry.event.id)!).filter(Boolean),
      };
    }
  }

  const selected = ranked[0].event;
  const match = params.events.find((event) => event.id === selected.id) ?? null;

  return {
    match,
    candidates: match ? [match] : [],
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
  matchSource: 'pinned_read' | 'starting_at_time' | 'title_only' | 'title_rank' | 'none';
} {
  const timeZone = params.timeZone ?? resolveTargetDayContext(params.transcript, params.referenceNow).timezone;
  const schedule = parseCalendarUpdateSchedule(params.transcript, params.referenceNow, timeZone);
  const titleQuery = params.titleQuery.trim();

  if (!schedule.ok) {
    if (!titleQuery) {
      return {
        match: null,
        titleQuery,
        clockMinutes: null,
        candidates: [],
        fromMs: null,
        toMs: null,
        matchSource: 'none',
      };
    }

    const titleOnly = findUpdateMatchByTitle({
      events: params.events,
      titleQuery,
      timeZone,
      referenceNow: params.referenceNow,
    });

    return {
      match: titleOnly.match,
      titleQuery,
      clockMinutes: null,
      candidates: titleOnly.candidates,
      fromMs: titleOnly.match ? Date.parse(titleOnly.match.startsAt) : null,
      toMs: null,
      matchSource: titleOnly.match ? 'title_only' : 'none',
    };
  }

  if (schedule.kind === 'destination' || schedule.kind === 'relative_offset') {
    const titleMatch = findUpdateMatchByTitle({
      events: params.events,
      titleQuery,
      timeZone,
      referenceNow: params.referenceNow,
    });

    const matchedStartMs = titleMatch.match ? Date.parse(titleMatch.match.startsAt) : null;
    const toMs =
      matchedStartMs === null || Number.isNaN(matchedStartMs)
        ? null
        : resolveUpdateTargetMs({ schedule, matchedEventStartMs: matchedStartMs });

    logUpdateRequest({
      transcript: params.transcript,
      titleQuery,
      fromTime: matchedStartMs ? formatClockLabel(getZonedClockMinutes(matchedStartMs, timeZone)) : 'unknown',
      toTime: toMs ? formatClockLabel(getZonedClockMinutes(toMs, timeZone)) : 'unknown',
      pinnedEventId: getLastCalendarReadMatch()?.eventId ?? null,
    });

    logUpdateMatch({
      titleQuery,
      fromTime: matchedStartMs ? formatClockLabel(getZonedClockMinutes(matchedStartMs, timeZone)) : 'unknown',
      match: titleMatch.match,
      source: titleMatch.match ? 'title_rank' : 'none',
      candidateCount: titleMatch.candidates.length,
    });

    return {
      match: titleMatch.match,
      titleQuery,
      clockMinutes: matchedStartMs ? getZonedClockMinutes(matchedStartMs, timeZone) : null,
      candidates: titleMatch.candidates,
      fromMs: matchedStartMs,
      toMs,
      matchSource: titleMatch.match ? 'title_only' : 'none',
    };
  }

  logUpdateRequest({
    transcript: params.transcript,
    titleQuery,
    fromTime: formatClockLabel(schedule.fromMinutes),
    toTime: formatClockLabel(schedule.toMinutes),
    pinnedEventId: getLastCalendarReadMatch()?.eventId ?? null,
  });

  const resolved = findCalendarEventAtTimeFromEvents({
    events: params.events,
    transcript: params.transcript,
    referenceNow: params.referenceNow,
    titleQuery,
    clockMinutes: schedule.fromMinutes,
    timeZone,
    matchMode: 'starting_at_time',
  });

  logUpdateMatch({
    titleQuery,
    fromTime: formatClockLabel(schedule.fromMinutes),
    match: resolved.match,
    source: resolved.matchSource,
    candidateCount: resolved.candidates.length,
  });

  return {
    ...resolved,
    fromMs: schedule.fromMs,
    toMs: schedule.toMs,
  };
}

function getZonedClockMinutes(instantMs: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(new Date(instantMs));

  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);

  return hour * 60 + minute;
}

export type CalendarDeleteEventMatchResult = {
  match: CalendarEvent | null;
  titleQuery: string;
  clockMinutes: number | null;
  candidates: CalendarEvent[];
  hasExplicitTime: boolean;
  matchSource: 'pinned_read' | 'starting_at_time' | 'title_only' | 'title_rank' | 'none';
  notFoundReason:
    | 'empty_title'
    | 'no_clock_minutes'
    | 'no_events_at_start_time'
    | 'no_title_match_at_time'
    | 'ambiguous_title_at_time'
    | 'no_title_match_on_day'
    | 'ambiguous_title_on_day'
    | null;
};

export function findCalendarEventForDeleteFromEvents(params: {
  transcript: string;
  referenceNow: Date;
  events: CalendarEvent[];
  titleQuery: string;
  timeZone?: string;
}): CalendarDeleteEventMatchResult {
  const timeZone = params.timeZone ?? resolveTargetDayContext(params.transcript, params.referenceNow).timezone;
  const day = resolveTargetDayContext(params.transcript, params.referenceNow, timeZone);
  const titleQuery = params.titleQuery.trim();
  const clockMinutes = parseCalendarClockMinutes(params.transcript, day);
  const activeEvents = params.events.filter((event) => !event.isCancelled);

  if (!titleQuery) {
    logDeleteNotFoundReason({
      reason: 'empty_title',
      titleQuery,
      clockMinutes,
      candidateCount: 0,
    });

    return {
      match: null,
      titleQuery,
      clockMinutes,
      candidates: [],
      hasExplicitTime: clockMinutes !== null,
      matchSource: 'none',
      notFoundReason: 'empty_title',
    };
  }

  if (clockMinutes !== null) {
    const resolved = findCalendarEventAtTimeFromEvents({
      events: activeEvents,
      transcript: params.transcript,
      referenceNow: params.referenceNow,
      titleQuery,
      clockMinutes,
      timeZone,
      matchMode: 'starting_at_time',
    });

    logDeleteCandidate({
      count: resolved.candidates.length,
      candidates: resolved.candidates.map((event) => ({
        id: event.id,
        title: event.title,
        startsAt: event.startsAt,
      })),
    });

    if (resolved.candidates.length === 0) {
      logDeleteNotFoundReason({
        reason: 'no_events_at_start_time',
        titleQuery,
        clockMinutes,
        candidateCount: 0,
      });

      return {
        match: null,
        titleQuery,
        clockMinutes,
        candidates: [],
        hasExplicitTime: true,
        matchSource: 'none',
        notFoundReason: 'no_events_at_start_time',
      };
    }

    if (resolved.candidates.length > 1) {
      const topScore = scoreTitleMatch(titleQuery, resolved.candidates[0].title);
      const strongMatches = resolved.candidates.filter(
        (event) => scoreTitleMatch(titleQuery, event.title) >= Math.max(70, topScore - 5),
      );

      if (strongMatches.length > 1) {
        logDeleteNotFoundReason({
          reason: 'ambiguous_title_at_time',
          titleQuery,
          clockMinutes,
          candidateCount: strongMatches.length,
        });

        return {
          match: null,
          titleQuery,
          clockMinutes,
          candidates: strongMatches,
          hasExplicitTime: true,
          matchSource: 'none',
          notFoundReason: 'ambiguous_title_at_time',
        };
      }
    }

    if (!resolved.match) {
      logDeleteNotFoundReason({
        reason: 'no_title_match_at_time',
        titleQuery,
        clockMinutes,
        candidateCount: resolved.candidates.length,
      });

      return {
        match: null,
        titleQuery,
        clockMinutes,
        candidates: resolved.candidates,
        hasExplicitTime: true,
        matchSource: 'none',
        notFoundReason: 'no_title_match_at_time',
      };
    }

    return {
      match: resolved.match,
      titleQuery,
      clockMinutes,
      candidates: resolved.candidates,
      hasExplicitTime: true,
      matchSource: resolved.matchSource,
      notFoundReason: null,
    };
  }

  const normalized = normalizeCalendarEvents(activeEvents, timeZone);
  const dayEvents = getEventsForDay(normalized, day);
  const titleMatches = dayEvents
    .map((event) => ({
      event,
      score: scoreTitleMatch(titleQuery, event.title),
    }))
    .filter((entry) => entry.score >= 70)
    .sort((left, right) => right.score - left.score);

  const candidateIds = new Set(titleMatches.map((entry) => entry.event.id));
  const candidates = activeEvents.filter((event) => candidateIds.has(event.id));

  logDeleteCandidate({
    count: candidates.length,
    candidates: candidates.map((event) => ({
      id: event.id,
      title: event.title,
      startsAt: event.startsAt,
    })),
  });

  if (candidates.length === 0) {
    logDeleteNotFoundReason({
      reason: 'no_title_match_on_day',
      titleQuery,
      clockMinutes: null,
      candidateCount: 0,
    });

    return {
      match: null,
      titleQuery,
      clockMinutes: null,
      candidates: [],
      hasExplicitTime: false,
      matchSource: 'none',
      notFoundReason: 'no_title_match_on_day',
    };
  }

  if (candidates.length > 1) {
    logDeleteNotFoundReason({
      reason: 'ambiguous_title_on_day',
      titleQuery,
      clockMinutes: null,
      candidateCount: candidates.length,
    });

    return {
      match: null,
      titleQuery,
      clockMinutes: null,
      candidates,
      hasExplicitTime: false,
      matchSource: 'none',
      notFoundReason: 'ambiguous_title_on_day',
    };
  }

  return {
    match: candidates[0],
    titleQuery,
    clockMinutes: null,
    candidates,
    hasExplicitTime: false,
    matchSource: 'title_only',
    notFoundReason: null,
  };
}
