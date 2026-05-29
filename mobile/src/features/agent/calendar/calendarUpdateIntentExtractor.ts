import {
  logUpdateIntentDetected,
  logUpdateMissingFields,
  logUpdateParametersExtracted,
} from '@/src/features/agent/calendar/calendarUpdateLogger';
import {
  formatUpdateScheduleFromTime,
  formatUpdateScheduleToTime,
  parseCalendarUpdateSchedule,
  stripCalendarUpdateSchedulePhrases,
} from '@/src/features/agent/calendar/calendarUpdateScheduleParser';
import { UPDATE_COMMAND_PREFIX } from '@/src/features/agent/calendar/calendarUpdateVerbs';
import { getExecutiveCalendarTimezone } from '@/src/features/agent/calendar/calendarTimezone';

export { UPDATE_COMMAND_PREFIX };

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

function normalizeAccusativeWord(word: string) {
  if (word.length < 4) {
    return word;
  }

  if (/^[A-Za-zА-Яа-яЁёІіЇїЄє'-]+у$/u.test(word)) {
    return `${word.slice(0, -1)}а`;
  }

  return word;
}

function normalizeUpdateTitle(title: string) {
  const words = title.trim().split(/\s+/u);

  if (words.length === 0) {
    return title;
  }

  words[0] = normalizeAccusativeWord(words[0]);

  return words.join(' ');
}

export function extractUpdateEventTitle(transcript: string) {
  let text = transcript.replace(UPDATE_COMMAND_PREFIX, '').trim();
  text = stripCalendarUpdateSchedulePhrases(text).trim();
  text = text.replace(/^[\s,.:;!\-—]+|[\s,.:;!\-—]+$/gu, '');
  text = text.replace(/\s+(?:с|з|на|from|to)\.?$/iu, '').trim();
  text = normalizeUpdateTitle(text);

  return text.length >= 2 ? text : null;
}

export function extractCalendarUpdateParameters(
  transcript: string,
  referenceNow: Date,
): CalendarUpdateExtractResult {
  const normalized = transcript.trim();
  const timeZone = getExecutiveCalendarTimezone();

  logUpdateIntentDetected({
    transcriptPreview: normalized.slice(0, 160),
  });

  const schedule = parseCalendarUpdateSchedule(normalized, referenceNow, timeZone);
  const title = extractUpdateEventTitle(normalized);

  let fromTime: string | null = null;
  let toTime: string | null = null;
  let fromMs: number | null = null;
  let toMs: number | null = null;

  if (schedule.ok) {
    if (schedule.kind === 'from_to') {
      fromMs = schedule.fromMs;
      toMs = schedule.toMs;
      fromTime = formatUpdateScheduleFromTime({
        schedule,
        matchedEventStartMs: schedule.fromMs,
        timeZone,
      });
      toTime = formatUpdateScheduleToTime(schedule, timeZone);
    } else if (schedule.kind === 'destination') {
      toMs = schedule.toMs;
      toTime = formatUpdateScheduleToTime(schedule, timeZone);
    } else {
      toTime = formatUpdateScheduleToTime(schedule, timeZone);
    }
  }

  const missingFields: CalendarUpdateMissingField[] = [];

  if (!title) {
    missingFields.push('title');
  }

  if (!schedule.ok) {
    if (title) {
      missingFields.push('fromTime', 'toTime');
    }
  } else if (schedule.kind === 'from_to') {
    if (!fromTime) {
      missingFields.push('fromTime');
    }

    if (!toTime) {
      missingFields.push('toTime');
    }
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
