import type { CalendarEvent } from '@/src/entities/calendar/types';
import { getEventStartTimestamp } from '@/src/features/agent/calendar/calendarSchedule';

export type CalendarDeleteRankedCandidate = {
  event: CalendarEvent;
  score: number;
  titleScore: number;
  timeScore: number;
};

const GENERIC_DELETE_TITLES = new Set([
  'meeting',
  'event',
  'events',
  'task',
  'call',
  'встреча',
  'встречу',
  'событие',
  'события',
  'зустріч',
  'подія',
  'my meeting',
  'my event',
]);

const RECURRING_INSTANCE_ID_PATTERN = /_[0-9]{8}T[0-9]{6}Z?$/i;

export type CalendarDeleteResolution =
  | {
      status: 'unique';
      event: CalendarEvent;
      titleQuery: string;
      targetMs: number | null;
      candidates: CalendarDeleteRankedCandidate[];
    }
  | {
      status: 'not_found';
      titleQuery: string;
      targetMs: number | null;
      candidates: CalendarDeleteRankedCandidate[];
    }
  | {
      status: 'ambiguous';
      titleQuery: string;
      targetMs: number | null;
      candidates: CalendarDeleteRankedCandidate[];
    }
  | {
      status: 'recurring_not_supported';
      event: CalendarEvent;
      titleQuery: string;
      targetMs: number | null;
      candidates: CalendarDeleteRankedCandidate[];
    }
  | {
      status: 'all_day_not_supported';
      event: CalendarEvent;
      titleQuery: string;
      targetMs: number | null;
      candidates: CalendarDeleteRankedCandidate[];
    };

function normalizeMatchText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function tokenize(value: string) {
  return normalizeMatchText(value)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 2);
}

function searchEventsByTitle(events: CalendarEvent[], titleQuery: string) {
  const queryNorm = normalizeMatchText(titleQuery);

  if (!queryNorm) {
    return [] as CalendarDeleteRankedCandidate[];
  }

  return events
    .map((event) => {
      const eventNorm = normalizeMatchText(event.title);
      let titleScore = 0;

      if (eventNorm === queryNorm) {
        titleScore = 100;
      } else if (eventNorm.includes(queryNorm) || queryNorm.includes(eventNorm)) {
        titleScore = 80;
      } else {
        const queryTokens = tokenize(queryNorm);
        const eventTokens = new Set(tokenize(eventNorm));
        const overlap = queryTokens.filter((token) => eventTokens.has(token)).length;
        titleScore = overlap > 0 ? Math.round((overlap / queryTokens.length) * 70) : 0;
      }

      return {
        event,
        score: titleScore,
        titleScore,
        timeScore: 0,
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);
}

function scoreTimeMatch(event: CalendarEvent, targetMs: number | null) {
  if (targetMs === null) {
    return 0;
  }

  const start = getEventStartTimestamp(event);

  if (start === null) {
    return 0;
  }

  const deltaMinutes = Math.abs(start - targetMs) / 60_000;

  if (deltaMinutes <= 5) {
    return 40;
  }

  if (deltaMinutes <= 30) {
    return 25;
  }

  if (deltaMinutes <= 120) {
    return 10;
  }

  return 0;
}

export function isRecurringGoogleCalendarEventId(eventId: string) {
  return RECURRING_INSTANCE_ID_PATTERN.test(eventId.trim());
}

function isVagueDeleteTitle(titleQuery: string) {
  const normalized = titleQuery.trim().toLowerCase();

  if (!normalized || normalized.length < 3) {
    return true;
  }

  if (GENERIC_DELETE_TITLES.has(normalized)) {
    return true;
  }

  return /^my\s+(meeting|event|call)\b/i.test(normalized);
}

function rankDeleteCandidates(params: {
  events: CalendarEvent[];
  titleQuery: string;
  targetMs: number | null;
}) {
  const activeEvents = params.events.filter((event) => !event.isCancelled);

  return searchEventsByTitle(activeEvents, params.titleQuery)
    .map((entry) => {
      const timeScore = scoreTimeMatch(entry.event, params.targetMs);
      return {
        ...entry,
        timeScore,
        score: entry.titleScore + timeScore,
      };
    })
    .filter((entry) => entry.score >= 40)
    .sort((left, right) => right.score - left.score);
}

function isAmbiguousDeleteMatch(params: {
  ranked: CalendarDeleteRankedCandidate[];
  titleQuery: string;
  hasExplicitTime: boolean;
}) {
  if (params.ranked.length <= 1) {
    return false;
  }

  const [top, second] = params.ranked;

  if (top.score - second.score <= 10) {
    return true;
  }

  if (top.titleScore >= 80 && second.titleScore >= 80) {
    const topTitle = top.event.title.trim().toLowerCase();
    const secondTitle = second.event.title.trim().toLowerCase();

    if (topTitle === secondTitle || topTitle.includes(secondTitle) || secondTitle.includes(topTitle)) {
      if (top.score - second.score <= 20) {
        return true;
      }
    }
  }

  if (!params.hasExplicitTime && isVagueDeleteTitle(params.titleQuery)) {
    return true;
  }

  if (!params.hasExplicitTime && params.ranked.length > 1 && top.titleScore < 100) {
    return true;
  }

  if (
    !params.hasExplicitTime &&
    params.ranked.filter((entry) => entry.titleScore >= 70).length > 1
  ) {
    return true;
  }

  return false;
}

export function resolveCalendarDeleteTargetFromEvents(params: {
  events: CalendarEvent[];
  titleQuery: string;
  targetMs: number | null;
  hasExplicitTime: boolean;
}): CalendarDeleteResolution {
  const ranked = rankDeleteCandidates({
    events: params.events,
    titleQuery: params.titleQuery,
    targetMs: params.targetMs,
  });

  const base = {
    titleQuery: params.titleQuery,
    targetMs: params.targetMs,
    candidates: ranked,
  };

  if (!params.titleQuery.trim()) {
    return { status: 'not_found', ...base };
  }

  if (ranked.length === 0) {
    return { status: 'not_found', ...base };
  }

  if (isAmbiguousDeleteMatch({
    ranked,
    titleQuery: params.titleQuery,
    hasExplicitTime: params.hasExplicitTime,
  })) {
    return { status: 'ambiguous', ...base };
  }

  const match = ranked[0].event;

  if (match.isAllDay) {
    return { status: 'all_day_not_supported', event: match, ...base };
  }

  if (isRecurringGoogleCalendarEventId(match.id)) {
    return { status: 'recurring_not_supported', event: match, ...base };
  }

  return { status: 'unique', event: match, ...base };
}
