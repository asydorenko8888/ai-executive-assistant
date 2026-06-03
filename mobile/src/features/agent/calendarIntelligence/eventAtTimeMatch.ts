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
import {
  findMoveConversationEventInList,
  resolveMoveEventReference,
} from '@/src/features/agent/calendar/calendarConversationEventMemory';
import {
  getActiveCalendarEvent,
  resolveActiveEventForMutation,
  resolveMutationSearchDayOffset,
  shouldResolveMutationFromActiveMemory,
} from '@/src/features/agent/calendar/calendarActiveEventContext';
import { isDeleteAllCalendarCommand } from '@/src/features/agent/calendar/calendarDeleteIntentExtractor';
import {
  EVENT_PRONOUN_REFERENCE,
  isIgnorableTitleQueryForMemory,
  resolveEventTitleQueryForMemory,
} from '@/src/features/agent/calendar/calendarEventReferenceTokens';
import { calendarConversationTitlesMatch } from '@/src/features/agent/calendar/calendarConversationTitleMatch';
import {
  scoreTitleMatch,
  scoreTitleMatchForMutation,
  selectBestEventByTitlePriority,
} from '@/src/features/agent/calendar/calendarTitleMatchPriority';
import { validateMoveTargetAgainstConversationMemory } from '@/src/features/agent/calendar/calendarConversationMemorySchedule';
import { getLastCalendarReadMatch } from '@/src/features/agent/execution/calendarExecutionSession';

function pickBestNormalizedMatch(
  candidates: NormalizedCalendarEvent[],
  titleQuery: string,
): NormalizedCalendarEvent | null {
  if (candidates.length === 0) {
    return null;
  }

  const queryNorm = titleQuery.trim();

  if (!queryNorm) {
    return candidates.length === 1 ? candidates[0] : null;
  }

  const selection = selectBestEventByTitlePriority(candidates, queryNorm);

  if (selection.ambiguous || !selection.match) {
    const exactOnly = candidates.filter(
      (event) => scoreTitleMatchForMutation(queryNorm, event.title).tier === 'exact',
    );

    if (exactOnly.length === 1) {
      return exactOnly[0];
    }

    return null;
  }

  return selection.match;
}

function formatClockLabel(minutes: number) {
  const pad = (value: number) => String(value).padStart(2, '0');

  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

function tryPinnedConversationMemory(params: {
  events: CalendarEvent[];
  titleQuery: string;
  referenceNow: Date;
}) {
  const effectiveTitleQuery = isIgnorableTitleQueryForMemory(params.titleQuery)
    ? ''
    : params.titleQuery;

  const pinned = findMoveConversationEventInList({
    events: params.events,
    referenceNow: params.referenceNow,
    titleQuery: effectiveTitleQuery,
  }) ?? resolveActiveEventForMutation({
    events: params.events,
    referenceNow: params.referenceNow,
    titleQuery: effectiveTitleQuery,
  });

  if (!pinned && effectiveTitleQuery) {
    const fallback =
      findMoveConversationEventInList({
        events: params.events,
        referenceNow: params.referenceNow,
        titleQuery: '',
      }) ??
      resolveActiveEventForMutation({
        events: params.events,
        referenceNow: params.referenceNow,
        titleQuery: '',
      });

    if (fallback) {
      return { match: fallback, source: 'conversation_memory' as const };
    }
  }

  if (!pinned) {
    return null;
  }

  return { match: pinned, source: 'conversation_memory' as const };
}

function resolveUpdateFromConversationMemory(params: {
  events: CalendarEvent[];
  titleQuery: string;
  referenceNow: Date;
  transcript: string;
  timeZone: string;
  schedule: ReturnType<typeof parseCalendarUpdateSchedule>;
}) {
  const memoryPinned = tryPinnedConversationMemory({
    events: params.events,
    titleQuery: params.titleQuery,
    referenceNow: params.referenceNow,
  });

  if (!memoryPinned) {
    return null;
  }

  const matchedStartMs = Date.parse(memoryPinned.match.startsAt);
  const toMs =
    params.schedule.ok === true
      ? resolveUpdateTargetMs({
          schedule: params.schedule,
          matchedEventStartMs: matchedStartMs,
          referenceNow: params.referenceNow,
          timeZone: params.timeZone,
        })
      : null;

  return {
    match: memoryPinned.match,
    titleQuery: memoryPinned.match.title,
    clockMinutes: Number.isNaN(matchedStartMs)
      ? null
      : getZonedClockMinutes(matchedStartMs, params.timeZone),
    candidates: [memoryPinned.match],
    fromMs: Number.isNaN(matchedStartMs) ? null : matchedStartMs,
    toMs,
    ambiguous: false,
    matchSource: memoryPinned.source,
  };
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

  if (params.titleQuery && scoreTitleMatchForMutation(params.titleQuery, pinned.title).tier === 'none') {
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
  /** When false, never use prior READ session hints — mutations must use fresh Google list only. */
  allowSessionHint?: boolean;
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

  const allowSessionHint = params.allowSessionHint ?? true;
  const pinned = allowSessionHint
    ? tryPinnedReadMatch({ events: params.events, titleQuery, clockMinutes })
    : null;

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
      ? atTimeNormalized.filter(
          (event) => scoreTitleMatchForMutation(titleQuery, event.title).tier !== 'none',
        )
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

function applyMoveMemoryScheduleGuard<T extends CalendarEvent | null>(params: {
  match: T;
  referenceNow: Date;
  matchSource: string;
  titleQuery?: string;
}): T {
  const validated = validateMoveTargetAgainstConversationMemory({
    event: params.match,
    referenceNow: params.referenceNow,
    matchSource: params.matchSource,
    titleQuery: params.titleQuery,
  });

  return (validated.ok ? validated.event : null) as T;
}

function findUpdateMatchByTitle(params: {
  events: CalendarEvent[];
  titleQuery: string;
  timeZone: string;
  referenceNow: Date;
  transcript?: string;
}) {
  const effectiveTitleQuery = isIgnorableTitleQueryForMemory(params.titleQuery)
    ? ''
    : params.titleQuery.trim();
  const memoryPinned = findMoveConversationEventInList({
    events: params.events,
    referenceNow: params.referenceNow,
    titleQuery: effectiveTitleQuery,
  });

  if (memoryPinned) {
    return {
      match: memoryPinned,
      candidates: [memoryPinned],
      ambiguous: false,
    };
  }

  const conversationRef = resolveMoveEventReference(params.referenceNow);

  if (conversationRef) {
    const userNamedDifferentEvent =
      effectiveTitleQuery &&
      !calendarConversationTitlesMatch(effectiveTitleQuery, conversationRef.title);

    if (!userNamedDifferentEvent) {
      return { match: null, candidates: [] as CalendarEvent[], ambiguous: false };
    }
  }

  const day = resolveTargetDayContext(params.transcript ?? '', params.referenceNow, params.timeZone);
  const normalized = normalizeCalendarEvents(params.events, params.timeZone);
  const dayEvents = getEventsForDay(normalized, day);
  const dayCalendarEvents = dayEvents
    .map((event) => params.events.find((entry) => entry.id === event.id))
    .filter((event): event is CalendarEvent => Boolean(event));
  const selection = selectBestEventByTitlePriority(dayCalendarEvents, params.titleQuery);

  if (selection.ambiguous) {
    return {
      match: null,
      candidates: selection.candidates,
      ambiguous: true,
    };
  }

  if (!selection.match) {
    return { match: null, candidates: [] as CalendarEvent[], ambiguous: false };
  }

  const match = applyMoveMemoryScheduleGuard({
    match: selection.match,
    referenceNow: params.referenceNow,
    matchSource: 'title_only',
    titleQuery: params.titleQuery,
  });

  return {
    match,
    candidates: match ? [match] : [],
    ambiguous: false,
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
  ambiguous: boolean;
  matchSource:
    | 'pinned_read'
    | 'conversation_memory'
    | 'starting_at_time'
    | 'title_only'
    | 'title_rank'
    | 'none';
} {
  const timeZone = params.timeZone ?? resolveTargetDayContext(params.transcript, params.referenceNow).timezone;
  const schedule = parseCalendarUpdateSchedule(params.transcript, params.referenceNow, timeZone);
  const titleQuery = params.titleQuery.trim();

  const memoryResolved = resolveUpdateFromConversationMemory({
    events: params.events,
    titleQuery,
    referenceNow: params.referenceNow,
    transcript: params.transcript,
    timeZone,
    schedule,
  });

  if (memoryResolved) {
    return memoryResolved;
  }

  if (!schedule.ok) {
    if (!titleQuery) {
      return {
        match: null,
        titleQuery,
        clockMinutes: null,
        candidates: [],
        fromMs: null,
        toMs: null,
        ambiguous: false,
        matchSource: 'none',
      };
    }

    const titleOnly = findUpdateMatchByTitle({
      events: params.events,
      titleQuery,
      timeZone,
      referenceNow: params.referenceNow,
      transcript: params.transcript,
    });

    const guardedMatch = applyMoveMemoryScheduleGuard({
      match: titleOnly.match,
      referenceNow: params.referenceNow,
      matchSource: 'title_only',
      titleQuery,
    });

    return {
      match: guardedMatch,
      titleQuery,
      clockMinutes: null,
      candidates: guardedMatch ? [guardedMatch] : [],
      fromMs: guardedMatch ? Date.parse(guardedMatch.startsAt) : null,
      toMs: null,
      ambiguous: guardedMatch ? false : titleOnly.ambiguous,
      matchSource: guardedMatch ? 'title_only' : 'none',
    };
  }

  if (
    schedule.kind === 'destination' ||
    schedule.kind === 'relative_offset' ||
    schedule.kind === 'day_preserve_time' ||
    schedule.kind === 'event_day_shift' ||
    schedule.kind === 'day_period'
  ) {
    const titleMatch = findUpdateMatchByTitle({
      events: params.events,
      titleQuery,
      timeZone,
      referenceNow: params.referenceNow,
      transcript: params.transcript,
    });

    const matchedStartMs = titleMatch.match ? Date.parse(titleMatch.match.startsAt) : null;
    const toMs =
      matchedStartMs === null || Number.isNaN(matchedStartMs)
        ? null
        : resolveUpdateTargetMs({
            schedule,
            matchedEventStartMs: matchedStartMs,
            referenceNow: params.referenceNow,
            timeZone,
          });

    logUpdateRequest({
      transcript: params.transcript,
      titleQuery,
      fromTime: matchedStartMs ? formatClockLabel(getZonedClockMinutes(matchedStartMs, timeZone)) : 'unknown',
      toTime: toMs ? formatClockLabel(getZonedClockMinutes(toMs, timeZone)) : 'unknown',
      pinnedEventId: null,
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
      ambiguous: titleMatch.ambiguous,
      matchSource: titleMatch.match ? 'title_only' : 'none',
    };
  }

  const conversationRef = resolveMoveEventReference(params.referenceNow);
  const effectiveTitleQuery = isIgnorableTitleQueryForMemory(titleQuery) ? '' : titleQuery;

  if (conversationRef) {
    const userNamedDifferentEvent =
      effectiveTitleQuery &&
      !calendarConversationTitlesMatch(effectiveTitleQuery, conversationRef.title);

    if (!userNamedDifferentEvent) {
      return {
        match: null,
        titleQuery,
        clockMinutes: schedule.fromMinutes,
        candidates: [],
        fromMs: schedule.fromMs,
        toMs: schedule.toMs,
        ambiguous: false,
        matchSource: 'none',
      };
    }
  }

  logUpdateRequest({
    transcript: params.transcript,
    titleQuery,
    fromTime: formatClockLabel(schedule.fromMinutes),
    toTime: formatClockLabel(schedule.toMinutes),
    pinnedEventId: null,
  });

  const resolved = findCalendarEventAtTimeFromEvents({
    events: params.events,
    transcript: params.transcript,
    referenceNow: params.referenceNow,
    titleQuery,
    clockMinutes: schedule.fromMinutes,
    timeZone,
    matchMode: 'starting_at_time',
    allowSessionHint: false,
  });

  logUpdateMatch({
    titleQuery,
    fromTime: formatClockLabel(schedule.fromMinutes),
    match: resolved.match,
    source: resolved.matchSource,
    candidateCount: resolved.candidates.length,
  });

  const guardedMatch = applyMoveMemoryScheduleGuard({
    match: resolved.match,
    referenceNow: params.referenceNow,
    matchSource: resolved.matchSource,
    titleQuery,
  });
  const ambiguous = !guardedMatch && resolved.candidates.length > 1;

  return {
    ...resolved,
    match: guardedMatch,
    candidates: guardedMatch ? [guardedMatch] : resolved.candidates,
    fromMs: schedule.fromMs,
    toMs: schedule.toMs,
    ambiguous,
    matchSource: guardedMatch ? resolved.matchSource : 'none',
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
  matchSource: 'pinned_read' | 'conversation_memory' | 'starting_at_time' | 'title_only' | 'title_rank' | 'none';
  notFoundReason:
    | 'empty_title'
    | 'no_clock_minutes'
    | 'no_events_at_start_time'
    | 'no_title_match_at_time'
    | 'ambiguous_title_at_time'
    | 'no_title_match_on_day'
    | 'ambiguous_title_on_day'
    | 'delete_all_matches'
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
  const titleQuery = params.titleQuery.trim();
  const memoryRef = resolveMoveEventReference(params.referenceNow);
  const effectiveTitleQuery = resolveEventTitleQueryForMemory({
    extractedTitle: titleQuery,
    memoryTitle: memoryRef?.title ?? null,
  });
  const activeEvents = params.events.filter((event) => !event.isCancelled);
  const deleteAllRequested = isDeleteAllCalendarCommand(params.transcript);

  const strongTitleMatches = activeEvents
    .map((event) => ({
      event,
      score: scoreTitleMatch(effectiveTitleQuery, event.title),
    }))
    .filter((entry) => entry.score >= 70)
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.event);

  if (deleteAllRequested && strongTitleMatches.length >= 2) {
    return {
      match: null,
      titleQuery: effectiveTitleQuery,
      clockMinutes: null,
      candidates: strongTitleMatches,
      hasExplicitTime: false,
      matchSource: 'none',
      notFoundReason: 'delete_all_matches',
    };
  }

  const pronounReference = EVENT_PRONOUN_REFERENCE.test(params.transcript);
  const memoryMatch =
    shouldResolveMutationFromActiveMemory({
      transcript: params.transcript,
      referenceNow: params.referenceNow,
      titleQuery: effectiveTitleQuery,
      timeZone,
    }) && strongTitleMatches.length <= 1
      ? resolveActiveEventForMutation({
          events: activeEvents,
          referenceNow: params.referenceNow,
          titleQuery: effectiveTitleQuery,
        })
      : null;

  if (memoryMatch && (pronounReference || strongTitleMatches.length <= 1)) {
    return {
      match: memoryMatch,
      titleQuery: memoryMatch.title,
      clockMinutes: null,
      candidates: [memoryMatch],
      hasExplicitTime: false,
      matchSource: 'conversation_memory',
      notFoundReason: null,
    };
  }

  if (!effectiveTitleQuery) {
    logDeleteNotFoundReason({
      reason: 'empty_title',
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
      notFoundReason: 'empty_title',
    };
  }

  const day = resolveTargetDayContext(params.transcript, params.referenceNow, timeZone);
  const clockMinutes = parseCalendarClockMinutes(params.transcript, day);
  const resolvedTitleQuery = effectiveTitleQuery;
  const hasExplicitDay =
    /\b(?:today|tomorrow|завтра|сьогодні|сегодня|післязавтра|послезавтра|monday|tuesday|wednesday|thursday|friday|saturday|sunday|понедельник|вторник|сред|четверг|пятниц|суббот|воскрес)\b/iu.test(
      params.transcript,
    );

  if (clockMinutes === null && strongTitleMatches.length > 1 && !deleteAllRequested) {
    logDeleteNotFoundReason({
      reason: 'ambiguous_title_on_day',
      titleQuery,
      clockMinutes: null,
      candidateCount: strongTitleMatches.length,
    });

    return {
      match: null,
      titleQuery,
      clockMinutes: null,
      candidates: strongTitleMatches,
      hasExplicitTime: false,
      matchSource: 'none',
      notFoundReason: 'ambiguous_title_on_day',
    };
  }

  if (clockMinutes !== null) {
    const resolved = findCalendarEventAtTimeFromEvents({
      events: activeEvents,
      transcript: params.transcript,
      referenceNow: params.referenceNow,
      titleQuery: resolvedTitleQuery,
      clockMinutes,
      timeZone,
      matchMode: 'starting_at_time',
      allowSessionHint: false,
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
  const titleSearchEvents = hasExplicitDay
    ? activeEvents.filter((event) => dayEvents.some((entry) => entry.id === event.id))
    : activeEvents;
  const titleMatches = titleSearchEvents
    .map((event) => ({
      event,
      score: scoreTitleMatch(resolvedTitleQuery, event.title),
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
