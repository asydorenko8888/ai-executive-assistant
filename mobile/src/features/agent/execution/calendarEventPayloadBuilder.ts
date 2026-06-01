import type { CalendarCreateEventPayload } from '@/src/features/agent/execution/actionExecutionTypes';
import { extractCreateEventTitle } from '@/src/features/agent/calendar/calendarCreateIntentExtractor';
import { parseCalendarCreateSchedule } from '@/src/features/agent/calendar/calendarCreateScheduleParser';
import { logCalendarCreate } from '@/src/features/agent/execution/calendarCreateLogger';
import {
  extractCalendarCommand,
  isCalendarExtractionExecutable,
} from '@/src/features/agent/calendar/calendarCommandExtractor';
import { formatLocationShort } from '@/src/features/agent/calendar/calendarLocation';
import {
  formatGoogleDateTimeFromUtcMs,
  getExecutiveCalendarTimezone,
} from '@/src/features/agent/calendar/calendarTimezone';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { getChatLocaleFromVoiceLanguage } from '@/src/features/chat/services/voiceLanguage';
import { logActionExecution } from '@/src/features/agent/execution/actionExecutionLogger';

export { parseOperationalScheduleHint } from '@/src/features/agent/calendar/operationalScheduleParser';
export type { OperationalScheduleParseResult } from '@/src/features/agent/calendar/operationalScheduleParser';

export function extractCalendarEventLocation(transcript: string) {
  const patterns = [
    /\b(?:в|у|at)\s+((?:библиотек\w+|library|office|офис\w*)[\s\S]{0,120}?)(?:\s*$|[,.])/iu,
    /\b(?:в|у|at)\s+([\p{L}0-9][\p{L}0-9\s,'-]{2,80})$/iu,
  ];

  for (const pattern of patterns) {
    const match = transcript.match(pattern);

    if (match?.[1]) {
      const location = formatLocationShort(match[1].trim()) || match[1].trim();
      return location.length > 0 ? location : null;
    }
  }

  return null;
}

export function buildCalendarCreateEventPayload(params: {
  transcript: string;
  languageCode: VoiceLanguageCode;
  referenceNow: Date;
  /** Current user message only — used for CREATE title extraction. */
  titleSourceTranscript?: string;
  scheduleOverride?: {
    startMs: number;
    endMs: number;
    explicitDayOffset?: number;
  };
}):
  | { ok: true; payload: CalendarCreateEventPayload; scheduleIso: string; startMs: number; endMs: number }
  | { ok: false; reason: 'date_parse_failed'; detail: string } {
  const extraction = extractCalendarCommand({
    transcript: params.transcript,
    titleSourceTranscript: params.titleSourceTranscript ?? params.transcript,
    referenceNow: params.referenceNow,
  });

  if (!isCalendarExtractionExecutable(extraction)) {
    const detail =
      !extraction.title
        ? 'Could not extract event title from command'
        : !extraction.datetime
          ? 'Could not extract event start time from command'
          : extraction.confidence < 0.8
            ? `Extraction confidence ${extraction.confidence} below threshold — title/datetime not confirmed`
            : 'Calendar command extraction failed';

    logCalendarCreate('parsed payload', {
      ok: false,
      reason: detail,
      confidence: extraction.confidence,
      title: extraction.title,
      transcriptPreview: params.transcript.slice(0, 120),
    });

    return {
      ok: false,
      reason: 'date_parse_failed',
      detail,
    };
  }

  const schedule = params.scheduleOverride
    ? {
        ok: true as const,
        startMs: params.scheduleOverride.startMs,
        endMs: params.scheduleOverride.endMs,
        hasExplicitTime: true as const,
        explicitDayOffset: params.scheduleOverride.explicitDayOffset ?? 0,
      }
    : parseCalendarCreateSchedule(params.transcript, params.referenceNow);

  if (!schedule.ok) {
    return schedule;
  }

  const location = extractCalendarEventLocation(params.transcript);
  const summary = extraction.title;
  const timeZone = getExecutiveCalendarTimezone();
  const durationMs = schedule.endMs - schedule.startMs;

  const payload: CalendarCreateEventPayload = {
    summary,
    location: location ?? undefined,
    start: {
      dateTime: formatGoogleDateTimeFromUtcMs(schedule.startMs, timeZone),
      timeZone,
    },
    end: {
      dateTime: formatGoogleDateTimeFromUtcMs(schedule.endMs, timeZone),
      timeZone,
    },
  };

  const parsedForLog = {
    title: summary,
    date:
      schedule.explicitDayOffset === 0
        ? 'TODAY'
        : schedule.explicitDayOffset === 1
          ? 'TOMORROW'
          : 'RELATIVE',
    time: payload.start.dateTime.slice(11, 16),
    calendarAction: 'create_event',
    timeZone,
    startIso: new Date(schedule.startMs).toISOString(),
    durationMinutes: Math.round(durationMs / 60_000),
    confidence: extraction.confidence,
    cleanedCommand: extraction.cleanedCommand.slice(0, 120),
  };

  logCalendarCreate('parsed payload', parsedForLog);

  logActionExecution('payload_generated', {
    summary: payload.summary,
    location: payload.location ?? null,
    timeZone,
    start: payload.start,
    end: payload.end,
    extractionConfidence: extraction.confidence,
  });

  return {
    ok: true,
    payload,
    scheduleIso: new Date(schedule.startMs).toISOString(),
    startMs: schedule.startMs,
    endMs: schedule.endMs,
  };
}

export function formatVerifiedEventScheduleLabel(
  event: { startsAt: string; location?: string },
  languageCode: VoiceLanguageCode,
) {
  const startMs = Date.parse(event.startsAt);
  const date = Number.isNaN(startMs) ? new Date() : new Date(startMs);
  const locale = getChatLocaleFromVoiceLanguage(languageCode);
  const intlLocale = locale === 'ru' ? 'ru-RU' : locale === 'uk' ? 'uk-UA' : 'en-US';

  const dayLine = date.toLocaleDateString(intlLocale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const timeLine = date.toLocaleTimeString(intlLocale, {
    hour: 'numeric',
    minute: '2-digit',
  });

  return {
    dayLine,
    timeLine,
    locationLine: event.location?.trim() || null,
  };
}
