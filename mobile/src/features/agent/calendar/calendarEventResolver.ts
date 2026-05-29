import type { CalendarEvent } from '@/src/entities/calendar/types';
import { fetchEventsByDate } from '@/src/features/agent/calendar/calendarAgendaRefresh';
import { getCalendarAgendaWindow } from '@/src/features/agent/calendar/calendarTime';
import { fetchGoogleCalendarEventsFromBackend } from '@/src/features/agent/calendar/googleCalendarBackendApi';
import { logCalendarRefresh } from '@/src/features/agent/calendar/calendarPipelineLogger';
import {
  filterUpcomingTimedEvents,
  getEventStartTimestamp,
  sortEventsChronologically,
} from '@/src/features/agent/calendar/calendarSchedule';

export type CalendarEventCandidate = {
  event: CalendarEvent;
  score: number;
  titleScore: number;
  timeScore: number;
};

function normalizeMatchText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function tokenize(value: string) {
  return normalizeMatchText(value)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 2);
}

export function searchEventsByTitle(events: CalendarEvent[], titleQuery: string) {
  const queryNorm = normalizeMatchText(titleQuery);

  if (!queryNorm) {
    return [] as CalendarEventCandidate[];
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

export async function loadEventsForResolution(params: {
  referenceNow: Date;
  dayOffset?: number;
}) {
  if (params.dayOffset !== undefined) {
    return fetchEventsByDate(params.referenceNow, params.dayOffset);
  }

  const window = getCalendarAgendaWindow(params.referenceNow);
  const listed = await fetchGoogleCalendarEventsFromBackend({
    timeMin: window.timeMin,
    timeMax: window.timeMax,
  });

  return sortEventsChronologically(
    listed.events.map((event) => ({
      id: event.id,
      title: event.summary.trim() || 'Untitled event',
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      location: event.location,
      isAllDay: !event.startsAt.includes('T'),
      attendees: [],
    })),
  );
}

export async function resolveCalendarEventCandidates(params: {
  titleQuery: string;
  targetMs?: number | null;
  referenceNow: Date;
  minScore?: number;
  logUpdateDiagnostics?: boolean;
}) {
  const minScore = params.minScore ?? 40;
  const events = await loadEventsForResolution({ referenceNow: params.referenceNow });
  const upcoming = filterUpcomingTimedEvents(events, params.referenceNow);
  const titleMatches = searchEventsByTitle(upcoming, params.titleQuery);

  const ranked = titleMatches
    .map((entry) => {
      const timeScore = scoreTimeMatch(entry.event, params.targetMs ?? null);
      return {
        ...entry,
        timeScore,
        score: entry.titleScore + timeScore,
      };
    })
    .filter((entry) => entry.score >= minScore)
    .sort((left, right) => right.score - left.score);

  const match = ranked[0]?.event ?? null;

  if (params.logUpdateDiagnostics) {
    const { logUpdateResolutionDiagnostics } = await import(
      '@/src/features/agent/calendar/calendarUpdateResolutionDiagnostics'
    );

    logUpdateResolutionDiagnostics({
      titleQuery: params.titleQuery,
      targetMs: params.targetMs ?? null,
      rawEvents: events,
      upcomingEvents: upcoming,
    });
  }

  logCalendarRefresh('resolve_candidates', {
    titleQuery: params.titleQuery,
    targetMs: params.targetMs ?? null,
    candidateCount: ranked.length,
    candidates: ranked.slice(0, 5).map((entry) => ({
      id: entry.event.id,
      title: entry.event.title,
      startsAt: entry.event.startsAt,
      score: entry.score,
    })),
  });

  return {
    match,
    candidates: ranked,
    eventsScanned: upcoming.length,
  };
}

export function isCalendarEventResolutionReady(candidate: CalendarEventCandidate | null) {
  return Boolean(candidate && candidate.score >= 80 && candidate.titleScore >= 70);
}
