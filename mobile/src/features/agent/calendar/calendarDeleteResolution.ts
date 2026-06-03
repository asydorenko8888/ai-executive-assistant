import type { CalendarEvent } from '@/src/entities/calendar/types';
import {
  findCalendarEventForDeleteFromEvents,
  type CalendarDeleteEventMatchResult,
} from '@/src/features/agent/calendarIntelligence/eventAtTimeMatch';

export type CalendarDeleteRankedCandidate = {
  event: CalendarEvent;
  score: number;
  titleScore: number;
  timeScore: number;
};

const RECURRING_INSTANCE_ID_PATTERN = /_[0-9]{8}T[0-9]{6}Z?$/i;

export type CalendarDeleteNotFoundReason = NonNullable<CalendarDeleteEventMatchResult['notFoundReason']>;

export type CalendarDeleteResolution =
  | {
      status: 'unique';
      event: CalendarEvent;
      titleQuery: string;
      targetMs: number | null;
      candidates: CalendarDeleteRankedCandidate[];
      notFoundReason: null;
    }
  | {
      status: 'not_found';
      titleQuery: string;
      targetMs: number | null;
      candidates: CalendarDeleteRankedCandidate[];
      notFoundReason: CalendarDeleteNotFoundReason;
    }
  | {
      status: 'ambiguous';
      titleQuery: string;
      targetMs: number | null;
      candidates: CalendarDeleteRankedCandidate[];
      notFoundReason: 'ambiguous_title_at_time' | 'ambiguous_title_on_day';
    }
  | {
      status: 'recurring_not_supported';
      event: CalendarEvent;
      titleQuery: string;
      targetMs: number | null;
      candidates: CalendarDeleteRankedCandidate[];
      notFoundReason: null;
    }
  | {
      status: 'all_day_not_supported';
      event: CalendarEvent;
      titleQuery: string;
      targetMs: number | null;
      candidates: CalendarDeleteRankedCandidate[];
      notFoundReason: null;
    }
  | {
      status: 'fetch_failed';
      titleQuery: string;
      targetMs: null;
      candidates: CalendarDeleteRankedCandidate[];
      notFoundReason: null;
    }
  | {
      status: 'delete_all';
      events: CalendarEvent[];
      titleQuery: string;
      targetMs: null;
      candidates: CalendarDeleteRankedCandidate[];
      notFoundReason: null;
    };

function mapCandidates(events: CalendarEvent[]): CalendarDeleteRankedCandidate[] {
  return events.map((event) => ({
    event,
    score: 100,
    titleScore: 100,
    timeScore: 40,
  }));
}

export function isRecurringGoogleCalendarEventId(eventId: string) {
  return RECURRING_INSTANCE_ID_PATTERN.test(eventId.trim());
}

function finalizeUniqueMatch(params: {
  match: CalendarEvent;
  titleQuery: string;
  candidates: CalendarDeleteRankedCandidate[];
  targetMs: number | null;
}): CalendarDeleteResolution {
  const base = {
    titleQuery: params.titleQuery,
    targetMs: params.targetMs,
    candidates: params.candidates,
    notFoundReason: null as null,
  };

  if (params.match.isAllDay) {
    return { status: 'all_day_not_supported', event: params.match, ...base };
  }

  if (isRecurringGoogleCalendarEventId(params.match.id)) {
    return { status: 'recurring_not_supported', event: params.match, ...base };
  }

  return { status: 'unique', event: params.match, ...base };
}

export function resolveCalendarDeleteTargetFromEvents(params: {
  events: CalendarEvent[];
  titleQuery: string;
  transcript: string;
  referenceNow: Date;
  timeZone?: string;
}): CalendarDeleteResolution {
  const resolved = findCalendarEventForDeleteFromEvents({
    events: params.events,
    transcript: params.transcript,
    referenceNow: params.referenceNow,
    titleQuery: params.titleQuery,
    timeZone: params.timeZone,
  });

  const targetMs =
    resolved.match?.startsAt && !Number.isNaN(Date.parse(resolved.match.startsAt))
      ? Date.parse(resolved.match.startsAt)
      : null;
  const candidates = mapCandidates(resolved.candidates);
  const base = {
    titleQuery: resolved.titleQuery,
    targetMs,
    candidates,
  };

  if (resolved.notFoundReason === 'delete_all_matches') {
    return {
      status: 'delete_all',
      events: resolved.candidates,
      titleQuery: resolved.titleQuery,
      targetMs: null,
      candidates,
      notFoundReason: null,
    };
  }

  if (resolved.notFoundReason === 'ambiguous_title_at_time' || resolved.notFoundReason === 'ambiguous_title_on_day') {
    return {
      status: 'ambiguous',
      ...base,
      notFoundReason: resolved.notFoundReason,
    };
  }

  if (!resolved.match || resolved.notFoundReason) {
    return {
      status: 'not_found',
      ...base,
      notFoundReason: resolved.notFoundReason ?? 'no_title_match_at_time',
    };
  }

  return finalizeUniqueMatch({
    match: resolved.match,
    titleQuery: resolved.titleQuery,
    candidates,
    targetMs,
  });
}
