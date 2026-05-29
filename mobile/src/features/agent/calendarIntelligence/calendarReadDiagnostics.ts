import type { CalendarEvent } from '@/src/entities/calendar/types';
import type { CalendarReadTimeKind } from '@/src/features/agent/calendarIntelligence/calendarReadTimeIntent';
import type { CalendarQueryIntent } from '@/src/features/agent/calendarIntelligence/types';

function toDiagnosticEvent(event: Pick<CalendarEvent, 'id' | 'title' | 'startsAt' | 'endsAt'>) {
  return {
    id: event.id,
    title: event.title,
    start: event.startsAt,
    end: event.endsAt,
  };
}

export function logIntentClassified(params: {
  transcript: string;
  readTimeKind: CalendarReadTimeKind | null;
  calendarIntent: CalendarQueryIntent;
  normalizedTranscript?: string;
}) {
  console.log(
    '[INTENT_CLASSIFIED]',
    JSON.stringify(
      {
        transcript: params.transcript.slice(0, 200),
        normalizedTranscript: params.normalizedTranscript?.slice(0, 200),
        readTimeKind: params.readTimeKind,
        calendarIntent: params.calendarIntent,
      },
      null,
      2,
    ),
  );
}

export function logReadEventList(params: {
  transcript: string;
  dayDateKey: string;
  events: CalendarEvent[];
}) {
  console.log(
    '[READ_EVENT_LIST]',
    JSON.stringify(
      {
        transcriptPreview: params.transcript.slice(0, 200),
        dayDateKey: params.dayDateKey,
        count: params.events.length,
        events: params.events.map(toDiagnosticEvent),
      },
      null,
      2,
    ),
  );
}

export function logReadMatch(params: {
  transcript: string;
  readTimeKind: CalendarReadTimeKind;
  clockMinutes: number;
  matchedEvents: Array<Pick<CalendarEvent, 'id' | 'title' | 'startsAt' | 'endsAt'>>;
  pinnedEventId?: string | null;
}) {
  console.log(
    '[READ_MATCH]',
    JSON.stringify(
      {
        transcriptPreview: params.transcript.slice(0, 200),
        readTimeKind: params.readTimeKind,
        clockMinutes: params.clockMinutes,
        matchCount: params.matchedEvents.length,
        pinnedEventId: params.pinnedEventId ?? null,
        matches: params.matchedEvents.map(toDiagnosticEvent),
      },
      null,
      2,
    ),
  );
}

export function logUpdateRequest(params: {
  transcript: string;
  titleQuery: string;
  fromTime: string;
  toTime: string;
  pinnedEventId?: string | null;
}) {
  console.log(
    '[UPDATE_REQUEST]',
    JSON.stringify(
      {
        transcriptPreview: params.transcript.slice(0, 200),
        titleQuery: params.titleQuery,
        fromTime: params.fromTime,
        toTime: params.toTime,
        pinnedEventId: params.pinnedEventId ?? null,
      },
      null,
      2,
    ),
  );
}

export function logUpdateMatch(params: {
  titleQuery: string;
  fromTime: string;
  match: Pick<CalendarEvent, 'id' | 'title' | 'startsAt' | 'endsAt'> | null;
  source: 'pinned_read' | 'starting_at_time' | 'title_rank' | 'none';
  candidateCount: number;
}) {
  console.log(
    '[UPDATE_MATCH]',
    JSON.stringify(
      {
        titleQuery: params.titleQuery,
        fromTime: params.fromTime,
        source: params.source,
        candidateCount: params.candidateCount,
        match: params.match ? toDiagnosticEvent(params.match) : null,
      },
      null,
      2,
    ),
  );
}

export function logUpdateSuccess(params: {
  eventId: string;
  title: string;
  fromStart: string;
  toStart: string;
}) {
  console.log(
    '[UPDATE_SUCCESS]',
    JSON.stringify(
      {
        eventId: params.eventId,
        title: params.title,
        fromStart: params.fromStart,
        toStart: params.toStart,
      },
      null,
      2,
    ),
  );
}
