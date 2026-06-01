import {
  parseCalendarDayPeriodMinutes,
  stripCalendarDayPeriodPhrases,
} from '@/src/features/agent/calendar/calendarReschedulePeriods';
import {
  addDaysToZonedYmd,
  getExecutiveCalendarTimezone,
  getZonedTimeParts,
  getZonedYmd,
  zonedLocalToUtcMs,
} from '@/src/features/agent/calendar/calendarTimezone';
import {
  parseCalendarClockMinutes,
  parseCalendarPointSchedule,
  parseCalendarTimeShift,
  stripCalendarClockPhrases,
  stripCalendarTimeShiftPhrases,
} from '@/src/features/agent/calendarIntelligence/calendarClockParser';
import {
  parseNaturalDayOffset,
  stripNaturalDatePhrases,
} from '@/src/features/agent/calendarIntelligence/calendarNaturalDateParser';
import {
  CALENDAR_WORD_EDGE,
  CALENDAR_WORD_END,
} from '@/src/features/agent/calendarIntelligence/calendarTextBoundaries';
import { resolveTargetDayContext } from '@/src/features/agent/calendarIntelligence/resolveTargetDay';

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
      ok: true;
      kind: 'day_preserve_time';
      explicitDayOffset: number;
    }
  | {
      ok: true;
      kind: 'event_day_shift';
      shiftDays: number;
    }
  | {
      ok: true;
      kind: 'day_period';
      explicitDayOffset: number;
      clockMinutes: number;
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

const EN_MINUTES_LATER = new RegExp(
  `(?:^|[\\s,.;:!?—-]+)(\\d+)\\s+(?:minutes?|mins?)\\s+later${PHRASE_END}`,
  'i',
);

const EN_HOURS_LATER = new RegExp(
  `(?:^|[\\s,.;:!?—-]+)(\\d+)\\s+(?:hours?|hrs?)\\s+later${PHRASE_END}`,
  'i',
);

const EN_AN_HOUR_LATER = new RegExp(
  `(?:^|[\\s,.;:!?—-]+)(?:an?\\s+hour|one\\s+hour)\\s+later${PHRASE_END}`,
  'i',
);

const EN_HALF_HOUR_LATER = new RegExp(
  `(?:^|[\\s,.;:!?—-]+)(?:a\\s+)?half\\s+hour\\s+later${PHRASE_END}`,
  'i',
);

const EN_MINUTES_EARLIER = new RegExp(
  `(?:^|[\\s,.;:!?—-]+)(\\d+)\\s+(?:minutes?|mins?)\\s+earlier${PHRASE_END}`,
  'i',
);

const EN_HOURS_EARLIER = new RegExp(
  `(?:^|[\\s,.;:!?—-]+)(\\d+)\\s+(?:hours?|hrs?)\\s+earlier${PHRASE_END}`,
  'i',
);

const EN_EARLIER_BY = new RegExp(
  `(?:^|[\\s,.;:!?—-]+)earlier\\s+by\\s+(\\d+)\\s+(minutes?|mins?|hours?|hrs?)${PHRASE_END}`,
  'i',
);

const EN_LATER_BY = new RegExp(
  `(?:^|[\\s,.;:!?—-]+)later\\s+by\\s+(\\d+)\\s+(minutes?|mins?|hours?|hrs?)${PHRASE_END}`,
  'i',
);

const NEXT_WEEK = /\b(?:next\s+week|на\s+наступн(?:ому|ій)\s+тижн(?:і|е|ю)?)\b/iu;

const MOVE_TO_PREFIX = /\b(?:move|reschedule|shift|перенеси|перенести|здвинь|зсунь)\b.*?\b(?:to|на)\s+/iu;

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
  const enMinutesLater = transcript.match(EN_MINUTES_LATER);
  const enHoursLater = transcript.match(EN_HOURS_LATER);
  const enAnHourLater = transcript.match(EN_AN_HOUR_LATER);
  const enHalfHourLater = transcript.match(EN_HALF_HOUR_LATER);
  const enMinutesEarlier = transcript.match(EN_MINUTES_EARLIER);
  const enHoursEarlier = transcript.match(EN_HOURS_EARLIER);
  const enEarlierBy = transcript.match(EN_EARLIER_BY);
  const enLaterBy = transcript.match(EN_LATER_BY);

  if (enMinutesLater) {
    return {
      ok: true,
      kind: 'relative_offset',
      offsetMs: Number(enMinutesLater[1]) * 60_000,
      direction: 'later',
    };
  }

  if (enHoursLater) {
    return {
      ok: true,
      kind: 'relative_offset',
      offsetMs: Number(enHoursLater[1]) * 60 * 60_000,
      direction: 'later',
    };
  }

  if (enAnHourLater) {
    return {
      ok: true,
      kind: 'relative_offset',
      offsetMs: 60 * 60_000,
      direction: 'later',
    };
  }

  if (enHalfHourLater) {
    return {
      ok: true,
      kind: 'relative_offset',
      offsetMs: 30 * 60_000,
      direction: 'later',
    };
  }

  if (enMinutesEarlier) {
    return {
      ok: true,
      kind: 'relative_offset',
      offsetMs: Number(enMinutesEarlier[1]) * 60_000,
      direction: 'earlier',
    };
  }

  if (enHoursEarlier) {
    return {
      ok: true,
      kind: 'relative_offset',
      offsetMs: Number(enHoursEarlier[1]) * 60 * 60_000,
      direction: 'earlier',
    };
  }

  if (enEarlierBy) {
    const amount = Number(enEarlierBy[1]);
    const unit = enEarlierBy[2].toLowerCase();
    const offsetMs = /hour|hr/.test(unit) ? amount * 60 * 60_000 : amount * 60_000;

    return {
      ok: true,
      kind: 'relative_offset',
      offsetMs,
      direction: 'earlier',
    };
  }

  if (enLaterBy) {
    const amount = Number(enLaterBy[1]);
    const unit = enLaterBy[2].toLowerCase();
    const offsetMs = /hour|hr/.test(unit) ? amount * 60 * 60_000 : amount * 60_000;

    return {
      ok: true,
      kind: 'relative_offset',
      offsetMs,
      direction: 'later',
    };
  }

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

function parseEventWeekShift(transcript: string): CalendarUpdateSchedule | null {
  if (!NEXT_WEEK.test(transcript)) {
    return null;
  }

  return {
    ok: true,
    kind: 'event_day_shift',
    shiftDays: 7,
  };
}

function parseDayOnlyReschedule(
  transcript: string,
  referenceNow: Date,
  timeZone: string,
): CalendarUpdateSchedule | null {
  const dayResolution = parseNaturalDayOffset(transcript, referenceNow, timeZone);

  if (!dayResolution || NEXT_WEEK.test(transcript)) {
    return null;
  }

  const day = resolveTargetDayContext(transcript, referenceNow, timeZone);
  const clockMinutes = parseCalendarClockMinutes(transcript, day);
  const periodMinutes = parseCalendarDayPeriodMinutes(transcript);

  if (clockMinutes !== null || periodMinutes !== null) {
    return null;
  }

  return {
    ok: true,
    kind: 'day_preserve_time',
    explicitDayOffset: dayResolution.dayOffset,
  };
}

function parsePeriodReschedule(
  transcript: string,
  referenceNow: Date,
  timeZone: string,
): CalendarUpdateSchedule | null {
  const periodMinutes = parseCalendarDayPeriodMinutes(transcript);

  if (periodMinutes === null) {
    return null;
  }

  const dayResolution = parseNaturalDayOffset(transcript, referenceNow, timeZone);

  return {
    ok: true,
    kind: 'day_period',
    explicitDayOffset: dayResolution?.dayOffset ?? 0,
    clockMinutes: periodMinutes,
  };
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

  const weekShift = parseEventWeekShift(normalized);

  if (weekShift) {
    return weekShift;
  }

  if (!hasFromToShift(normalized)) {
    const period = parsePeriodReschedule(normalized, referenceNow, timeZone);

    if (period) {
      return period;
    }

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

    const dayOnly = parseDayOnlyReschedule(normalized, referenceNow, timeZone);

    if (dayOnly) {
      return dayOnly;
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
  cleaned = stripCalendarDayPeriodPhrases(cleaned);
  cleaned = stripCalendarClockPhrases(cleaned);
  cleaned = cleaned.replace(RELATIVE_LATER, ' ');
  cleaned = cleaned.replace(RELATIVE_EARLIER, ' ');
  cleaned = cleaned.replace(RELATIVE_MINUTES_LATER, ' ');
  cleaned = cleaned.replace(EN_MINUTES_LATER, ' ');
  cleaned = cleaned.replace(EN_HOURS_LATER, ' ');
  cleaned = cleaned.replace(EN_AN_HOUR_LATER, ' ');
  cleaned = cleaned.replace(EN_HALF_HOUR_LATER, ' ');
  cleaned = cleaned.replace(EN_MINUTES_EARLIER, ' ');
  cleaned = cleaned.replace(EN_HOURS_EARLIER, ' ');
  cleaned = cleaned.replace(EN_EARLIER_BY, ' ');
  cleaned = cleaned.replace(EN_LATER_BY, ' ');
  cleaned = cleaned.replace(NEXT_WEEK, ' ');
  cleaned = cleaned.replace(TEMPORAL_DAY_WORDS, ' ');
  cleaned = cleaned.replace(
    /(?:^|[\s,.;:!?—-]+)(?:на|to)\s+(?:завтра|tomorrow|today|сьогодні|сегодня|післязавтра|послезавтра)/giu,
    ' ',
  );
  cleaned = cleaned.replace(MOVE_TO_PREFIX, ' ');

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
  referenceNow?: Date;
  timeZone?: string;
}) {
  if (!params.schedule.ok) {
    return null;
  }

  const timeZone = params.timeZone ?? getExecutiveCalendarTimezone();
  const referenceNow = params.referenceNow ?? new Date();

  if (params.schedule.kind === 'from_to' || params.schedule.kind === 'destination') {
    return params.schedule.toMs;
  }

  if (params.schedule.kind === 'day_preserve_time') {
    const eventParts = getZonedTimeParts(new Date(params.matchedEventStartMs), timeZone);
    const targetYmd = addDaysToZonedYmd(
      getZonedYmd(referenceNow, timeZone),
      params.schedule.explicitDayOffset,
    );

    return zonedLocalToUtcMs(
      {
        ...targetYmd,
        hour: eventParts.hour,
        minute: eventParts.minute,
        second: 0,
      },
      timeZone,
    );
  }

  if (params.schedule.kind === 'event_day_shift') {
    const eventYmd = getZonedYmd(new Date(params.matchedEventStartMs), timeZone);
    const eventParts = getZonedTimeParts(new Date(params.matchedEventStartMs), timeZone);
    const targetYmd = addDaysToZonedYmd(eventYmd, params.schedule.shiftDays);

    return zonedLocalToUtcMs(
      {
        ...targetYmd,
        hour: eventParts.hour,
        minute: eventParts.minute,
        second: 0,
      },
      timeZone,
    );
  }

  if (params.schedule.kind === 'day_period') {
    const targetYmd = addDaysToZonedYmd(
      getZonedYmd(referenceNow, timeZone),
      params.schedule.explicitDayOffset,
    );
    const hour = Math.floor(params.schedule.clockMinutes / 60);
    const minute = params.schedule.clockMinutes % 60;

    return zonedLocalToUtcMs(
      {
        ...targetYmd,
        hour,
        minute,
        second: 0,
      },
      timeZone,
    );
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

  if (schedule.kind === 'day_period') {
    return formatClockLabelFromMinutes(schedule.clockMinutes);
  }

  if (schedule.kind !== 'relative_offset') {
    return null;
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
