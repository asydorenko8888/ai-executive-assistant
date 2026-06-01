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
      reason: 'date_parse_failed' | 'title_parse_failed' | 'event_not_found';
      detail: string;
    };

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
