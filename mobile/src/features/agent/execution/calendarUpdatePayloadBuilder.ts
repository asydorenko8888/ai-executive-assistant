import type { CalendarEvent } from '@/src/entities/calendar/types';
import { extractCalendarCommand } from '@/src/features/agent/calendar/calendarCommandExtractor';
import {
  formatGoogleDateTimeFromUtcMs,
  getExecutiveCalendarTimezone,
} from '@/src/features/agent/calendar/calendarTimezone';
import {
  parseCalendarUpdateSchedule,
  resolveUpdateTargetMs,
  stripCalendarUpdateSchedulePhrases,
} from '@/src/features/agent/calendar/calendarUpdateScheduleParser';
import type { CalendarUpdateResolvedIntent } from '@/src/features/agent/calendar/calendarUpdateEventResolution';
import type { CalendarUpdateEventPayload } from '@/src/features/agent/execution/actionExecutionTypes';
import { logCalendarCreate } from '@/src/features/agent/execution/calendarCreateLogger';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';

export type CalendarUpdatePayloadBuildResult =
  | {
      ok: true;
      eventId: string;
      payload: CalendarUpdateEventPayload;
      matchedEvent: CalendarEvent;
      fromMs: number;
      toMs: number;
    }
  | {
      ok: false;
      reason: 'date_parse_failed' | 'title_parse_failed' | 'event_not_found' | 'no_time_change';
      detail: string;
    };

const NO_OP_TOLERANCE_MS = 60_000;

export function buildCalendarUpdatePayloadFromResolution(params: {
  resolution: Extract<CalendarUpdateResolvedIntent, { ok: true }>;
  languageCode: VoiceLanguageCode;
}): CalendarUpdatePayloadBuildResult {
  const timeZone = getExecutiveCalendarTimezone();
  const { target, requestedStartMs, requestedEndMs, originalStartMs } = params.resolution;
  const resolvedTitle = target.title.trim() || params.resolution.requestedEventName;

  const payload: CalendarUpdateEventPayload = {
    summary: resolvedTitle,
    start: {
      dateTime: formatGoogleDateTimeFromUtcMs(requestedStartMs, timeZone),
      timeZone,
    },
    end: {
      dateTime: formatGoogleDateTimeFromUtcMs(requestedEndMs, timeZone),
      timeZone,
    },
  };

  logCalendarCreate('update parsed payload', {
    ok: true,
    eventId: target.id,
    title: payload.summary,
    fromMs: originalStartMs,
    toMs: requestedStartMs,
    start: payload.start,
    end: payload.end,
    languageCode: params.languageCode,
    timeZone,
    source: 'resolved_intent',
  });

  return {
    ok: true,
    eventId: target.id,
    payload,
    matchedEvent: target,
    fromMs: originalStartMs,
    toMs: requestedStartMs,
  };
}

export function buildCalendarUpdateEventPayload(params: {
  transcript: string;
  languageCode: VoiceLanguageCode;
  referenceNow: Date;
  matchedEvent: CalendarEvent;
}): CalendarUpdatePayloadBuildResult {
  const timeZone = getExecutiveCalendarTimezone();
  const schedule = parseCalendarUpdateSchedule(params.transcript, params.referenceNow, timeZone);

  if (!schedule.ok) {
    logCalendarCreate('update parsed payload', { ok: false, reason: schedule.detail });
    return {
      ok: false,
      reason: 'date_parse_failed',
      detail: schedule.detail,
    };
  }

  const matchedStartMs = Date.parse(params.matchedEvent.startsAt);

  if (Number.isNaN(matchedStartMs)) {
    return {
      ok: false,
      reason: 'event_not_found',
      detail: 'Matched event has invalid start timestamp',
    };
  }

  const targetToMs = resolveUpdateTargetMs({
    schedule,
    matchedEventStartMs: matchedStartMs,
    referenceNow: params.referenceNow,
    timeZone,
  });

  if (targetToMs === null || Number.isNaN(targetToMs)) {
    return {
      ok: false,
      reason: 'date_parse_failed',
      detail: 'Could not resolve update destination time',
    };
  }

  if (Math.abs(targetToMs - matchedStartMs) <= NO_OP_TOLERANCE_MS) {
    return {
      ok: false,
      reason: 'no_time_change',
      detail: 'Requested time is the same as the current event start time',
    };
  }

  const extraction = extractCalendarCommand({
    transcript: stripCalendarUpdateSchedulePhrases(params.transcript),
    referenceNow: params.referenceNow,
  });

  const resolvedTitle = params.matchedEvent.title.trim() || extraction.title;

  if (!resolvedTitle || (!params.matchedEvent.title.trim() && extraction.confidence < 0.8)) {
    return {
      ok: false,
      reason: 'title_parse_failed',
      detail: 'Could not extract event title from update command',
    };
  }

  const matchedEndMs = Date.parse(params.matchedEvent.endsAt);

  if (Number.isNaN(matchedEndMs)) {
    return {
      ok: false,
      reason: 'event_not_found',
      detail: 'Matched event has invalid start/end timestamps',
    };
  }

  const durationMs = Math.max(matchedEndMs - matchedStartMs, 30 * 60_000);
  const newEndMs = targetToMs + durationMs;

  const payload: CalendarUpdateEventPayload = {
    summary: resolvedTitle,
    start: {
      dateTime: formatGoogleDateTimeFromUtcMs(targetToMs, timeZone),
      timeZone,
    },
    end: {
      dateTime: formatGoogleDateTimeFromUtcMs(newEndMs, timeZone),
      timeZone,
    },
  };

  logCalendarCreate('update parsed payload', {
    ok: true,
    eventId: params.matchedEvent.id,
    title: payload.summary,
    fromMs: matchedStartMs,
    toMs: targetToMs,
    start: payload.start,
    end: payload.end,
    languageCode: params.languageCode,
    timeZone,
  });

  return {
    ok: true,
    eventId: params.matchedEvent.id,
    payload,
    matchedEvent: params.matchedEvent,
    fromMs: matchedStartMs,
    toMs: targetToMs,
  };
}

export function buildCalendarUpdatePayloadFromStoredTarget(params: {
  eventId: string;
  title: string;
  originalStartsAt: string;
  originalEndsAt: string;
  requestedStartMs: number;
  requestedEndMs: number;
  languageCode: VoiceLanguageCode;
}): CalendarUpdatePayloadBuildResult {
  const timeZone = getExecutiveCalendarTimezone();
  const matchedStartMs = Date.parse(params.originalStartsAt);
  const matchedEndMs = Date.parse(params.originalEndsAt);
  const requestedStartMs = params.requestedStartMs;
  const requestedEndMs = params.requestedEndMs;

  if (
    Number.isNaN(matchedStartMs) ||
    Number.isNaN(matchedEndMs) ||
    Number.isNaN(requestedStartMs) ||
    Number.isNaN(requestedEndMs)
  ) {
    return {
      ok: false,
      reason: 'event_not_found',
      detail: 'Stored update target has invalid timestamps',
    };
  }

  if (Math.abs(requestedStartMs - matchedStartMs) <= NO_OP_TOLERANCE_MS) {
    return {
      ok: false,
      reason: 'no_time_change',
      detail: 'Requested time is the same as the current event start time',
    };
  }

  const durationMs = Math.max(
    requestedEndMs - requestedStartMs,
    matchedEndMs - matchedStartMs,
    30 * 60_000,
  );
  const newEndMs = requestedStartMs + durationMs;
  const resolvedTitle = params.title.trim();

  if (!resolvedTitle) {
    return {
      ok: false,
      reason: 'title_parse_failed',
      detail: 'Stored update target is missing event title',
    };
  }

  const matchedEvent: CalendarEvent = {
    id: params.eventId,
    title: resolvedTitle,
    startsAt: params.originalStartsAt,
    endsAt: params.originalEndsAt,
    isAllDay: false,
  };

  const payload: CalendarUpdateEventPayload = {
    summary: resolvedTitle,
    start: {
      dateTime: formatGoogleDateTimeFromUtcMs(requestedStartMs, timeZone),
      timeZone,
    },
    end: {
      dateTime: formatGoogleDateTimeFromUtcMs(newEndMs, timeZone),
      timeZone,
    },
  };

  logCalendarCreate('update parsed payload', {
    ok: true,
    eventId: params.eventId,
    title: payload.summary,
    fromMs: matchedStartMs,
    toMs: requestedStartMs,
    start: payload.start,
    end: payload.end,
    languageCode: params.languageCode,
    timeZone,
    source: 'stored_conflict_target',
  });

  return {
    ok: true,
    eventId: params.eventId,
    payload,
    matchedEvent,
    fromMs: matchedStartMs,
    toMs: requestedStartMs,
  };
}
