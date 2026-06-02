import {
  logUpdateIntentDetected,
  logUpdateMissingFields,
  logUpdateParametersExtracted,
} from '@/src/features/agent/calendar/calendarUpdateLogger';
import {
  formatClockLabelFromInstantMs,
  formatUpdateScheduleFromTime,
  formatUpdateScheduleToTime,
  instantMsToIso,
  parseCalendarUpdateSchedule,
  resolveUpdateTargetMs,
  stripCalendarUpdateSchedulePhrases,
} from '@/src/features/agent/calendar/calendarUpdateScheduleParser';
import {
  isEventPronounReference,
  resolveEventTitleQueryForMemory,
} from '@/src/features/agent/calendar/calendarEventReferenceTokens';
import {
  isMeridiemOnlyTitle,
  isTemporalOnlyTitle,
  stripMeridiemTitleArtifact,
} from '@/src/features/agent/calendar/calendarTemporalWords';
import { resolveMoveEventReference } from '@/src/features/agent/calendar/calendarConversationEventMemory';
import { UPDATE_COMMAND_PREFIX } from '@/src/features/agent/calendar/calendarUpdateVerbs';
import { getExecutiveCalendarTimezone } from '@/src/features/agent/calendar/calendarTimezone';

export { UPDATE_COMMAND_PREFIX };

export type CalendarUpdateMissingField = 'title' | 'fromTime' | 'toTime';

export type CalendarUpdateExtractResult = {
  title: string | null;
  /** 24h clock labels derived from ISO instants — logging/UI only, never authoritative. */
  fromTime: string | null;
  toTime: string | null;
  fromStartISO: string | null;
  toStartISO: string | null;
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
  text = stripMeridiemTitleArtifact(text);
  text = normalizeUpdateTitle(text);

  if (
    text.length < 2 ||
    isEventPronounReference(text) ||
    isTemporalOnlyTitle(text) ||
    isMeridiemOnlyTitle(text)
  ) {
    return null;
  }

  return text;
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
  const extractedTitle = extractUpdateEventTitle(normalized);
  const memoryRef = resolveMoveEventReference(referenceNow);
  const titleQuery = resolveEventTitleQueryForMemory({
    extractedTitle,
    memoryTitle: memoryRef?.title ?? null,
  });
  const title = titleQuery || null;
  const memoryStartMs = memoryRef?.startISO ? Date.parse(memoryRef.startISO) : Number.NaN;
  const hasMemoryStart = !Number.isNaN(memoryStartMs);

  let fromTime: string | null = null;
  let toTime: string | null = null;
  let fromStartISO: string | null = null;
  let toStartISO: string | null = null;
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
      toTime = formatUpdateScheduleToTime(schedule, timeZone, schedule.fromMs);
    } else if (hasMemoryStart) {
      fromMs = memoryStartMs;
      toMs = resolveUpdateTargetMs({
        schedule,
        matchedEventStartMs: memoryStartMs,
        referenceNow,
        timeZone,
      });
      fromTime = formatClockLabelFromInstantMs(memoryStartMs, timeZone);
      toTime =
        toMs === null || Number.isNaN(toMs)
          ? formatUpdateScheduleToTime(schedule, timeZone, memoryStartMs)
          : formatClockLabelFromInstantMs(toMs, timeZone);
    } else if (schedule.kind === 'destination') {
      toMs = schedule.toMs;
      toTime = formatUpdateScheduleToTime(schedule, timeZone);
    } else {
      toTime = formatUpdateScheduleToTime(schedule, timeZone);
    }

    if (fromMs !== null && !Number.isNaN(fromMs)) {
      fromStartISO = instantMsToIso(fromMs);
    }

    if (toMs !== null && !Number.isNaN(toMs)) {
      toStartISO = instantMsToIso(toMs);
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
    if (fromMs === null || Number.isNaN(fromMs)) {
      missingFields.push('fromTime');
    }

    if (toMs === null || Number.isNaN(toMs)) {
      missingFields.push('toTime');
    }
  } else if (toMs === null || Number.isNaN(toMs)) {
    missingFields.push('toTime');
  }

  const readyToExecute = missingFields.length === 0;

  logUpdateParametersExtracted({
    title,
    fromStartISO,
    toStartISO,
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
    fromStartISO,
    toStartISO,
    fromMs,
    toMs,
    missingFields,
    readyToExecute,
  };
}
