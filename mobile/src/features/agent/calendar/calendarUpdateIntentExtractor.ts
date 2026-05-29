import {
  logUpdateIntentDetected,
  logUpdateMissingFields,
  logUpdateParametersExtracted,
} from '@/src/features/agent/calendar/calendarUpdateLogger';
import {
  parseCalendarUpdateTimeShift,
  stripCalendarUpdateTimeShiftPhrases,
} from '@/src/features/agent/calendar/calendarUpdateScheduleParser';

export const UPDATE_COMMAND_PREFIX =
  /^(?:please\s+)?(?:move|reschedule|update|shift|перенеси|перенести|перенес(?:ь|ьте)|перенос|измени|зміни)(?:[\s,:-]+|$)/iu;

export type CalendarUpdateMissingField = 'title' | 'fromTime' | 'toTime';

export type CalendarUpdateExtractResult = {
  title: string | null;
  fromTime: string | null;
  toTime: string | null;
  fromMs: number | null;
  toMs: number | null;
  missingFields: CalendarUpdateMissingField[];
  readyToExecute: boolean;
};

function formatClockLabel(instant: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');

  return `${pad(instant.getHours())}:${pad(instant.getMinutes())}`;
}

export function extractUpdateEventTitle(transcript: string) {
  let text = transcript.replace(UPDATE_COMMAND_PREFIX, '').trim();
  text = stripCalendarUpdateTimeShiftPhrases(text).trim();
  text = text.replace(/^[\s,.:;!\-—]+|[\s,.:;!\-—]+$/gu, '');
  text = text.replace(/\s+(?:с|з|на|from|to)\.?$/iu, '').trim();

  return text.length >= 2 ? text : null;
}

export function extractCalendarUpdateParameters(
  transcript: string,
  referenceNow: Date,
): CalendarUpdateExtractResult {
  const normalized = transcript.trim();

  logUpdateIntentDetected({
    transcriptPreview: normalized.slice(0, 160),
  });

  const shift = parseCalendarUpdateTimeShift(normalized, referenceNow);
  const title = extractUpdateEventTitle(normalized);

  let fromTime: string | null = null;
  let toTime: string | null = null;
  let fromMs: number | null = null;
  let toMs: number | null = null;

  if (shift.ok) {
    fromMs = shift.fromMs;
    toMs = shift.toMs;
    fromTime = formatClockLabel(new Date(shift.fromMs));
    toTime = formatClockLabel(new Date(shift.toMs));
  }

  const missingFields: CalendarUpdateMissingField[] = [];

  if (!title) {
    missingFields.push('title');
  }

  if (!fromTime) {
    missingFields.push('fromTime');
  }

  if (!toTime) {
    missingFields.push('toTime');
  }

  const readyToExecute = missingFields.length === 0;

  logUpdateParametersExtracted({
    title,
    fromTime,
    toTime,
    readyToExecute,
  });

  if (missingFields.length > 0) {
    logUpdateMissingFields({ missingFields });
  }

  return {
    title,
    fromTime,
    toTime,
    fromMs,
    toMs,
    missingFields,
    readyToExecute,
  };
}
