import type { CalendarEvent } from '@/src/entities/calendar/types';
import { extractCalendarCommand } from '@/src/features/agent/calendar/calendarCommandExtractor';
import { getBrowserTimezone } from '@/src/features/agent/calendar/calendarTime';
import { parseCalendarUpdateTimeShift, stripCalendarUpdateTimeShiftPhrases } from '@/src/features/agent/calendar/calendarUpdateScheduleParser';
import type { CalendarUpdateEventPayload } from '@/src/features/agent/execution/actionExecutionTypes';
import { logCalendarCreate } from '@/src/features/agent/execution/calendarCreateLogger';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';

function toGoogleDateTimeLocal(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

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
  const shift = parseCalendarUpdateTimeShift(params.transcript, params.referenceNow);

  if (!shift.ok) {
    logCalendarCreate('update parsed payload', { ok: false, reason: shift.detail });
    return {
      ok: false,
      reason: 'date_parse_failed',
      detail: shift.detail,
    };
  }

  const extraction = extractCalendarCommand({
    transcript: stripCalendarUpdateTimeShiftPhrases(params.transcript),
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

  const matchedStartMs = Date.parse(params.matchedEvent.startsAt);
  const matchedEndMs = Date.parse(params.matchedEvent.endsAt);

  if (Number.isNaN(matchedStartMs) || Number.isNaN(matchedEndMs)) {
    return {
      ok: false,
      reason: 'event_not_found',
      detail: 'Matched event has invalid start/end timestamps',
    };
  }

  const durationMs = Math.max(matchedEndMs - matchedStartMs, 30 * 60_000);
  const newStart = new Date(shift.toMs);
  const newEnd = new Date(newStart.getTime() + durationMs);
  const timeZone = getBrowserTimezone();

  const payload: CalendarUpdateEventPayload = {
    summary: resolvedTitle,
    start: {
      dateTime: toGoogleDateTimeLocal(newStart),
      timeZone,
    },
    end: {
      dateTime: toGoogleDateTimeLocal(newEnd),
      timeZone,
    },
  };

  logCalendarCreate('update parsed payload', {
    ok: true,
    eventId: params.matchedEvent.id,
    title: payload.summary,
    fromMs: shift.fromMs,
    toMs: shift.toMs,
    start: payload.start,
    end: payload.end,
    languageCode: params.languageCode,
  });

  return {
    ok: true,
    eventId: params.matchedEvent.id,
    payload,
    matchedEvent: params.matchedEvent,
    fromMs: shift.fromMs,
    toMs: shift.toMs,
  };
}
