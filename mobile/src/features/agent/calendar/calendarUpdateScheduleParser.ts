import { getExecutiveCalendarTimezone } from '@/src/features/agent/calendar/calendarTimezone';
import {
  parseCalendarPointSchedule,
  parseCalendarTimeShift,
  stripCalendarClockPhrases,
  stripCalendarTimeShiftPhrases,
} from '@/src/features/agent/calendarIntelligence/calendarClockParser';
import { stripNaturalDatePhrases } from '@/src/features/agent/calendarIntelligence/calendarNaturalDateParser';
import {
  CALENDAR_WORD_EDGE,
  CALENDAR_WORD_END,
} from '@/src/features/agent/calendarIntelligence/calendarTextBoundaries';
import { getZonedTimeParts } from '@/src/features/agent/calendar/calendarTimezone';

export type CalendarUpdateSchedule =
  | {
      ok: true;
      kind: 'from_to';
      fromMinutes: number;
      toMinutes: number;
      fromMs: number;
      toMs: number;
      hasExplicitDay: boolean;
    }
  | {
      ok: true;
      kind: 'destination';
      toMs: number;
      toMinutes: number;
      explicitDayOffset: number;
    }
  | {
      ok: true;
      kind: 'relative_offset';
      offsetMs: number;
      direction: 'later' | 'earlier';
    }
  | {
      ok: false;
      reason: 'date_parse_failed';
      detail: string;
    };

const PHRASE_END = '(?:$|[\\s,.;:!?—-])';

const RELATIVE_LATER = new RegExp(
  `(?:^|[\\s,.;:!?—-]+)(?:на|через)\\s+(?:(\\d+)\\s+)?(?:годин(?:у|и|ы)?|час(?:а|ов|у)?|hour(?:s)?)\\s+(?:позже|пізніше|later)${PHRASE_END}`,
  'iu',
);

const RELATIVE_EARLIER = new RegExp(
  `(?:^|[\\s,.;:!?—-]+)(?:на|через)\\s+(?:(\\d+)\\s+)?(?:годин(?:у|и|ы)?|час(?:а|ов|у)?|hour(?:s)?)\\s+(?:раньше|раніше|earlier)${PHRASE_END}`,
  'iu',
);

const RELATIVE_MINUTES_LATER = new RegExp(
  `(?:^|[\\s,.;:!?—-]+)(?:на|через)\\s+(?:(\\d+)\\s+)?(?:минут(?:ы)?|хвилин(?:и|у)?|minutes?)\\s+(?:позже|пізніше|later)${PHRASE_END}`,
  'iu',
);

const TEMPORAL_DAY_WORDS = new RegExp(
  `${CALENDAR_WORD_EDGE}(?:today|tonight|tomorrow|завтра|сьогодні|сегодня|післязавтра|послезавтра)${CALENDAR_WORD_END}`,
  'giu',
);

function hasFromToShift(transcript: string) {
  return /(?:^|[\s,.;:!?—-]+)(?:с|з|from)\s+\d/i.test(transcript);
}

function formatClockLabelFromMinutes(clockMinutes: number) {
  const pad = (value: number) => String(value).padStart(2, '0');

  return `${pad(Math.floor(clockMinutes / 60))}:${pad(clockMinutes % 60)}`;
}

function parseRelativeOffset(transcript: string): CalendarUpdateSchedule | null {
  const laterHours = transcript.match(RELATIVE_LATER);
  const earlierHours = transcript.match(RELATIVE_EARLIER);
  const laterMinutes = transcript.match(RELATIVE_MINUTES_LATER);

  if (laterHours) {
    const amount = laterHours[1] ? Number(laterHours[1]) : 1;

    return {
      ok: true,
      kind: 'relative_offset',
      offsetMs: amount * 60 * 60_000,
      direction: 'later',
    };
  }

  if (earlierHours) {
    const amount = earlierHours[1] ? Number(earlierHours[1]) : 1;

    return {
      ok: true,
      kind: 'relative_offset',
      offsetMs: amount * 60 * 60_000,
      direction: 'earlier',
    };
  }

  if (laterMinutes) {
    const amount = laterMinutes[1] ? Number(laterMinutes[1]) : 15;

    return {
      ok: true,
      kind: 'relative_offset',
      offsetMs: amount * 60_000,
      direction: 'later',
    };
  }

  return null;
}

export function parseCalendarUpdateSchedule(
  transcript: string,
  referenceNow: Date,
  timeZone = getExecutiveCalendarTimezone(),
): CalendarUpdateSchedule {
  const normalized = transcript.trim();
  const fromTo = parseCalendarTimeShift(normalized, referenceNow, timeZone);

  if (fromTo.ok) {
    return {
      ok: true,
      kind: 'from_to',
      fromMinutes: fromTo.fromMinutes,
      toMinutes: fromTo.toMinutes,
      fromMs: fromTo.fromMs,
      toMs: fromTo.toMs,
      hasExplicitDay: fromTo.hasExplicitDay,
    };
  }

  const relative = parseRelativeOffset(normalized);

  if (relative) {
    return relative;
  }

  if (!hasFromToShift(normalized)) {
    const point = parseCalendarPointSchedule(normalized, referenceNow, timeZone);

    if (point.ok) {
      const parts = getZonedTimeParts(new Date(point.startMs), timeZone);

      return {
        ok: true,
        kind: 'destination',
        toMs: point.startMs,
        toMinutes: parts.hour * 60 + parts.minute,
        explicitDayOffset: point.explicitDayOffset,
      };
    }
  }

  return {
    ok: false,
    reason: 'date_parse_failed',
    detail: 'Could not parse update schedule (expected from/to, destination, or relative shift)',
  };
}

export function stripCalendarUpdateSchedulePhrases(transcript: string) {
  let cleaned = stripCalendarTimeShiftPhrases(transcript);
  cleaned = stripNaturalDatePhrases(cleaned);
  cleaned = stripCalendarClockPhrases(cleaned);
  cleaned = cleaned.replace(RELATIVE_LATER, ' ');
  cleaned = cleaned.replace(RELATIVE_EARLIER, ' ');
  cleaned = cleaned.replace(RELATIVE_MINUTES_LATER, ' ');
  cleaned = cleaned.replace(TEMPORAL_DAY_WORDS, ' ');
  cleaned = cleaned.replace(
    /(?:^|[\s,.;:!?—-]+)(?:на|to)\s+(?:завтра|tomorrow|today|сьогодні|сегодня|післязавтра|послезавтра)/giu,
    ' ',
  );

  return cleaned.replace(/\s+/g, ' ').trim();
}

export type CalendarUpdateTimeShift = ReturnType<typeof parseCalendarTimeShift>;

export { stripCalendarTimeShiftPhrases };

export function parseCalendarUpdateTimeShift(
  transcript: string,
  referenceNow: Date,
): CalendarUpdateTimeShift {
  return parseCalendarTimeShift(transcript, referenceNow);
}

export function stripCalendarUpdateTimeShiftPhrases(transcript: string) {
  return stripCalendarUpdateSchedulePhrases(transcript);
}

export function resolveUpdateTargetMs(params: {
  schedule: CalendarUpdateSchedule;
  matchedEventStartMs: number;
}) {
  if (!params.schedule.ok) {
    return null;
  }

  if (params.schedule.kind === 'from_to' || params.schedule.kind === 'destination') {
    return params.schedule.toMs;
  }

  const signedOffset =
    params.schedule.direction === 'later' ? params.schedule.offsetMs : -params.schedule.offsetMs;

  return params.matchedEventStartMs + signedOffset;
}

export function formatUpdateScheduleToTime(schedule: CalendarUpdateSchedule, timeZone: string) {
  if (!schedule.ok) {
    return null;
  }

  if (schedule.kind === 'from_to') {
    return formatClockLabelFromMinutes(schedule.toMinutes);
  }

  if (schedule.kind === 'destination') {
    return formatClockLabelFromMinutes(schedule.toMinutes);
  }

  const parts = getZonedTimeParts(
    new Date(Date.now() + (schedule.direction === 'later' ? schedule.offsetMs : -schedule.offsetMs)),
    timeZone,
  );

  return formatClockLabelFromMinutes(parts.hour * 60 + parts.minute);
}

export function formatUpdateScheduleFromTime(params: {
  schedule: CalendarUpdateSchedule;
  matchedEventStartMs: number;
  timeZone: string;
}) {
  if (params.schedule.ok && params.schedule.kind === 'from_to') {
    return formatClockLabelFromMinutes(params.schedule.fromMinutes);
  }

  const parts = getZonedTimeParts(new Date(params.matchedEventStartMs), params.timeZone);

  return formatClockLabelFromMinutes(parts.hour * 60 + parts.minute);
}
