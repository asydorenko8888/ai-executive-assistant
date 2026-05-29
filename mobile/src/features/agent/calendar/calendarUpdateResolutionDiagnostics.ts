import type { CalendarEvent } from '@/src/entities/calendar/types';
import {
  getEventStartTimestamp,
} from '@/src/features/agent/calendar/calendarSchedule';

function normalizeMatchText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function tokenize(value: string) {
  return normalizeMatchText(value)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 2);
}

function computeTitleScore(titleQuery: string, eventTitle: string) {
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

function computeTimeScore(event: CalendarEvent, targetMs: number | null) {
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

function toDiagnosticEvent(event: CalendarEvent) {
  return {
    title: event.title,
    start: event.startsAt,
    end: event.endsAt,
    id: event.id,
  };
}

export function logReadEventListForDiagnostics(params: {
  transcript: string;
  dayDateKey: string;
  events: CalendarEvent[];
}) {
  console.log('[READ Diagnostics] query', {
    transcriptPreview: params.transcript.slice(0, 160),
    dayDateKey: params.dayDateKey,
  });

  console.log(
    '[READ Event List]',
    JSON.stringify(
      {
        count: params.events.length,
        events: params.events.map(toDiagnosticEvent),
      },
      null,
      2,
    ),
  );
}

export function logUpdateRequest(params: {
  requestedTitle: string;
  requestedFromTime: string;
  requestedToTime: string;
}) {
  console.log(
    '[UPDATE REQUEST]',
    JSON.stringify(
      {
        requestedTitle: params.requestedTitle,
        requestedFromTime: params.requestedFromTime,
        requestedToTime: params.requestedToTime,
      },
      null,
      2,
    ),
  );
}

export function logUpdateEventsBeforeFiltering(events: CalendarEvent[]) {
  events.forEach((event) => {
    console.log('[UPDATE EVENT]', JSON.stringify(toDiagnosticEvent(event), null, 2));
  });
}

export function logUpdateCandidate(params: {
  event: CalendarEvent;
  titleScore: number;
  timeScore: number;
  finalScore: number;
}) {
  console.log(
    '[UPDATE CANDIDATE]',
    JSON.stringify(
      {
        title: params.event.title,
        start: params.event.startsAt,
        end: params.event.endsAt,
        titleScore: params.titleScore,
        timeScore: params.timeScore,
        finalScore: params.finalScore,
      },
      null,
      2,
    ),
  );
}

export function logUpdateNotFound(params: {
  requestedTitle: string;
  requestedFromTime: string;
  requestedToTime: string;
}) {
  console.log(
    '[UPDATE NOT FOUND]',
    JSON.stringify(
      {
        requestedTitle: params.requestedTitle,
        requestedFromTime: params.requestedFromTime,
        requestedToTime: params.requestedToTime,
      },
      null,
      2,
    ),
  );
}

/** @deprecated Use logUpdateRequest — kept for call-site compatibility during diagnostics rollout. */
export function logUpdateParsedRequest(params: {
  transcript: string;
  titleSource: string;
  titleQuery: string;
  fromMs: number;
  toMs: number;
  fromTimeLabel: string;
  toTimeLabel: string;
}) {
  logUpdateRequest({
    requestedTitle: params.titleQuery,
    requestedFromTime: params.fromTimeLabel,
    requestedToTime: params.toTimeLabel,
  });
}

export function logUpdateResolutionDiagnostics(params: {
  titleQuery: string;
  targetMs: number | null;
  rawEvents: CalendarEvent[];
  upcomingEvents: CalendarEvent[];
}) {
  logUpdateEventsBeforeFiltering(params.rawEvents);

  for (const event of params.upcomingEvents) {
    const titleScore = computeTitleScore(params.titleQuery, event.title);
    const timeScore = computeTimeScore(event, params.targetMs);
    const finalScore = titleScore + timeScore;

    logUpdateCandidate({
      event,
      titleScore,
      timeScore,
      finalScore,
    });
  }
}
