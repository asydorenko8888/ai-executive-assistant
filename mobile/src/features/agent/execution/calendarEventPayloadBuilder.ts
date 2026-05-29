import type { CalendarCreateEventPayload } from '@/src/features/agent/execution/actionExecutionTypes';
import { logCalendarCreate } from '@/src/features/agent/execution/calendarCreateLogger';
import {
  extractCalendarCommand,
  isCalendarExtractionExecutable,
} from '@/src/features/agent/calendar/calendarCommandExtractor';
import { getBrowserTimezone } from '@/src/features/agent/calendar/calendarTime';
import { formatLocationShort } from '@/src/features/agent/calendar/calendarLocation';
import { parseOperationalScheduleHint } from '@/src/features/agent/calendar/operationalScheduleParser';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { getChatLocaleFromVoiceLanguage } from '@/src/features/chat/services/voiceLanguage';
import { logActionExecution } from '@/src/features/agent/execution/actionExecutionLogger';

export { parseOperationalScheduleHint } from '@/src/features/agent/calendar/operationalScheduleParser';
export type { OperationalScheduleParseResult } from '@/src/features/agent/calendar/operationalScheduleParser';

const DEFAULT_EVENT_DURATION_MS = 60 * 60 * 1000;

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

function toGoogleDateTimeLocal(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function buildCalendarCreateEventPayload(params: {
  transcript: string;
  languageCode: VoiceLanguageCode;
  referenceNow: Date;
}): { ok: true; payload: CalendarCreateEventPayload; scheduleIso: string } | { ok: false; reason: 'date_parse_failed'; detail: string } {
  const extraction = extractCalendarCommand({
    transcript: params.transcript,
    referenceNow: params.referenceNow,
  });

  if (!isCalendarExtractionExecutable(extraction)) {
    const detail =
      extraction.confidence < 0.8
        ? `Extraction confidence ${extraction.confidence} below threshold — title/datetime not confirmed`
        : !extraction.title
          ? 'Could not extract event title from command'
          : !extraction.datetime
            ? 'Could not extract event datetime from command'
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

  const schedule = parseOperationalScheduleHint(params.transcript, params.referenceNow);

  if (!schedule.ok) {
    return schedule;
  }

  const location = extractCalendarEventLocation(params.transcript);
  const summary = extraction.title;
  const timeZone = getBrowserTimezone();
  const startDate = new Date(extraction.datetime!);
  const durationMs = (extraction.durationMinutes ?? 60) * 60 * 1000;
  const endDate = new Date(startDate.getTime() + durationMs);

  const payload: CalendarCreateEventPayload = {
    summary,
    location: location ?? undefined,
    start: {
      dateTime: toGoogleDateTimeLocal(startDate),
      timeZone,
    },
    end: {
      dateTime: toGoogleDateTimeLocal(endDate),
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
    time: `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`,
    calendarAction: 'create_event',
    timeZone,
    startIso: startDate.toISOString(),
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
    scheduleIso: startDate.toISOString(),
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
