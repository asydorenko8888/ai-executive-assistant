import type { CalendarCreateScheduleResult } from '@/src/features/agent/calendar/calendarCreateScheduleParser';
import {
  addDaysToZonedYmd,
  getExecutiveCalendarTimezone,
  getZonedTimeParts,
  getZonedYmd,
  zonedLocalToUtcMs,
} from '@/src/features/agent/calendar/calendarTimezone';
import { parseCalendarPointSchedule } from '@/src/features/agent/calendarIntelligence/calendarClockParser';
import {
  CALENDAR_WORD_EDGE,
  CALENDAR_WORD_END,
} from '@/src/features/agent/calendarIntelligence/calendarTextBoundaries';

export type CalendarWeekdayCode = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

export type CalendarRecurrenceKind = 'daily' | 'weekly' | 'monthly';

export type ParsedCalendarRecurrence = {
  kind: CalendarRecurrenceKind;
  byDay?: CalendarWeekdayCode;
  rrule: string;
};

type RecurrenceResolveContext = {
  referenceNow: Date;
  timeZone: string;
};

export type CalendarCreateRecurrenceExtraction = {
  recurrence: ParsedCalendarRecurrence;
  transcriptWithoutRecurrence: string;
};

const WEEKDAY_TO_JS: Record<CalendarWeekdayCode, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

type RecurrencePattern = {
  pattern: RegExp;
  resolve: (match: RegExpMatchArray, ctx: RecurrenceResolveContext) => ParsedCalendarRecurrence;
};

function formatRruleUntilFromYmd(
  ymd: { year: number; month: number; day: number },
  timeZone: string,
) {
  const endMs = zonedLocalToUtcMs(
    { ...ymd, hour: 23, minute: 59, second: 59 },
    timeZone,
  );
  const utc = new Date(endMs);
  const pad = (value: number) => String(value).padStart(2, '0');

  return `UNTIL=${utc.getUTCFullYear()}${pad(utc.getUTCMonth() + 1)}${pad(utc.getUTCDate())}T${pad(utc.getUTCHours())}${pad(utc.getUTCMinutes())}${pad(utc.getUTCSeconds())}Z`;
}

function endOfWeekYmd(referenceNow: Date, timeZone: string, week: 'this' | 'next') {
  const refYmd = getZonedYmd(referenceNow, timeZone);
  const jsDay = jsDayFromZonedParts(refYmd, timeZone);
  const daysUntilSunday = jsDay === 0 ? 0 : 7 - jsDay;
  const offset = week === 'next' ? daysUntilSunday + 7 : daysUntilSunday;

  return addDaysToZonedYmd(refYmd, offset);
}

function limitedWeekRecurrence(params: {
  freq: 'daily' | 'weekdays';
  week: 'this' | 'next';
  ctx: RecurrenceResolveContext;
}): ParsedCalendarRecurrence {
  const until = formatRruleUntilFromYmd(
    endOfWeekYmd(params.ctx.referenceNow, params.ctx.timeZone, params.week),
    params.ctx.timeZone,
  );

  if (params.freq === 'weekdays') {
    return {
      kind: 'weekly',
      rrule: `RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;${until}`,
    };
  }

  return {
    kind: 'daily',
    rrule: `RRULE:FREQ=DAILY;${until}`,
  };
}

const RECURRENCE_PATTERNS: RecurrencePattern[] = [
  {
    pattern: new RegExp(
      `${CALENDAR_WORD_EDGE}(?:every\\s+day\\s+this\\s+week|каждый\\s+день\\s+на\\s+этой\\s+неделе|кожного\\s+дня\\s+цього\\s+тижня)${CALENDAR_WORD_END}`,
      'iu',
    ),
    resolve: (_match, ctx) => limitedWeekRecurrence({ freq: 'daily', week: 'this', ctx }),
  },
  {
    pattern: new RegExp(
      `${CALENDAR_WORD_EDGE}(?:every\\s+day\\s+next\\s+week|каждый\\s+день\\s+на\\s+следующей\\s+неделе|кожного\\s+дня\\s+наступного\\s+тижня)${CALENDAR_WORD_END}`,
      'iu',
    ),
    resolve: (_match, ctx) => limitedWeekRecurrence({ freq: 'daily', week: 'next', ctx }),
  },
  {
    pattern: new RegExp(
      `${CALENDAR_WORD_EDGE}(?:every\\s+weekday\\s+this\\s+week|каждый\\s+будний\\s+день\\s+на\\s+этой\\s+неделе|кожного\\s+буднього\\s+дня\\s+цього\\s+тижня)${CALENDAR_WORD_END}`,
      'iu',
    ),
    resolve: (_match, ctx) => limitedWeekRecurrence({ freq: 'weekdays', week: 'this', ctx }),
  },
  {
    pattern: new RegExp(
      `${CALENDAR_WORD_EDGE}(?:every\\s+weekday\\s+next\\s+week|каждый\\s+будний\\s+день\\s+на\\s+следующей\\s+неделе|кожного\\s+буднього\\s+дня\\s+наступного\\s+тижня)${CALENDAR_WORD_END}`,
      'iu',
    ),
    resolve: (_match, ctx) => limitedWeekRecurrence({ freq: 'weekdays', week: 'next', ctx }),
  },
  {
    pattern: new RegExp(
      `${CALENDAR_WORD_EDGE}(?:every\\s+weekday|каждый\\s+будний\\s+день|кожного\\s+буднього\\s+дня)${CALENDAR_WORD_END}`,
      'iu',
    ),
    resolve: () => ({
      kind: 'weekly',
      rrule: 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
    }),
  },
  {
    pattern: new RegExp(
      `${CALENDAR_WORD_EDGE}(?:every\\s+month|каждый\\s+месяц|щомісяця|щомісячно)${CALENDAR_WORD_END}`,
      'iu',
    ),
    resolve: () => ({
      kind: 'monthly',
      rrule: 'RRULE:FREQ=MONTHLY',
    }),
  },
  {
    pattern: new RegExp(
      `${CALENDAR_WORD_EDGE}(?:every\\s+day|every\\s+week|every\\s+monday|every\\s+tuesday|every\\s+wednesday|every\\s+thursday|every\\s+friday|every\\s+saturday|every\\s+sunday)${CALENDAR_WORD_END}`,
      'iu',
    ),
    resolve: (match) => {
      const phrase = match[0].toLowerCase();

      if (phrase.includes('every day')) {
        return { kind: 'daily', rrule: 'RRULE:FREQ=DAILY' };
      }

      if (phrase.includes('every week')) {
        return { kind: 'weekly', rrule: 'RRULE:FREQ=WEEKLY' };
      }

      const weekdayMap: Array<[string, CalendarWeekdayCode]> = [
        ['monday', 'MO'],
        ['tuesday', 'TU'],
        ['wednesday', 'WE'],
        ['thursday', 'TH'],
        ['friday', 'FR'],
        ['saturday', 'SA'],
        ['sunday', 'SU'],
      ];

      for (const [name, code] of weekdayMap) {
        if (phrase.includes(name)) {
          return { kind: 'weekly', byDay: code, rrule: `RRULE:FREQ=WEEKLY;BYDAY=${code}` };
        }
      }

      return { kind: 'weekly', rrule: 'RRULE:FREQ=WEEKLY' };
    },
  },
  {
    pattern: new RegExp(
      `${CALENDAR_WORD_EDGE}(?:ежедневно|каждый\\s+день|щодня|кожен\\s+день)${CALENDAR_WORD_END}`,
      'iu',
    ),
    resolve: () => ({
      kind: 'daily',
      rrule: 'RRULE:FREQ=DAILY',
    }),
  },
  {
    pattern: new RegExp(
      `${CALENDAR_WORD_EDGE}(?:каждую\\s+неделю|кожну\\s+тиждень|кожен\\s+тиждень|щотижня)${CALENDAR_WORD_END}`,
      'iu',
    ),
    resolve: () => ({
      kind: 'weekly',
      rrule: 'RRULE:FREQ=WEEKLY',
    }),
  },
  {
    pattern: new RegExp(
      `${CALENDAR_WORD_EDGE}(?:каждый|каждую|каждое|кожного|кожен|кожну|що)?\\s*(?:понедельник|понедельника|monday)${CALENDAR_WORD_END}`,
      'iu',
    ),
    resolve: () => ({ kind: 'weekly', byDay: 'MO', rrule: 'RRULE:FREQ=WEEKLY;BYDAY=MO' }),
  },
  {
    pattern: new RegExp(
      `${CALENDAR_WORD_EDGE}(?:каждый|кожного|кожен|що)?\\s*(?:вторник|вторника|tuesday)${CALENDAR_WORD_END}`,
      'iu',
    ),
    resolve: () => ({ kind: 'weekly', byDay: 'TU', rrule: 'RRULE:FREQ=WEEKLY;BYDAY=TU' }),
  },
  {
    pattern: new RegExp(
      `${CALENDAR_WORD_EDGE}(?:каждую|кожну|кожного|що)?\\s*(?:среду|среды|середу|wednesday)${CALENDAR_WORD_END}`,
      'iu',
    ),
    resolve: () => ({ kind: 'weekly', byDay: 'WE', rrule: 'RRULE:FREQ=WEEKLY;BYDAY=WE' }),
  },
  {
    pattern: new RegExp(
      `${CALENDAR_WORD_EDGE}(?:каждый|кожного|кожен|що)?\\s*(?:четверг|четверга|четвер|thursday)${CALENDAR_WORD_END}`,
      'iu',
    ),
    resolve: () => ({ kind: 'weekly', byDay: 'TH', rrule: 'RRULE:FREQ=WEEKLY;BYDAY=TH' }),
  },
  {
    pattern: new RegExp(
      `${CALENDAR_WORD_EDGE}(?:каждую|кожну|кожного|що)?\\s*(?:пятницу|пятницы|п[''']?ятниц[ауі]|friday)${CALENDAR_WORD_END}`,
      'iu',
    ),
    resolve: () => ({ kind: 'weekly', byDay: 'FR', rrule: 'RRULE:FREQ=WEEKLY;BYDAY=FR' }),
  },
  {
    pattern: new RegExp(
      `${CALENDAR_WORD_EDGE}(?:каждую|кожну|кожного|що)?\\s*(?:субботу|субботы|суботу|saturday)${CALENDAR_WORD_END}`,
      'iu',
    ),
    resolve: () => ({ kind: 'weekly', byDay: 'SA', rrule: 'RRULE:FREQ=WEEKLY;BYDAY=SA' }),
  },
  {
    pattern: new RegExp(
      `${CALENDAR_WORD_EDGE}(?:каждое|кожну|кожного|що)?\\s*(?:воскресенье|воскресенья|неділу|неділю|sunday)${CALENDAR_WORD_END}`,
      'iu',
    ),
    resolve: () => ({ kind: 'weekly', byDay: 'SU', rrule: 'RRULE:FREQ=WEEKLY;BYDAY=SU' }),
  },
  {
    pattern: new RegExp(
      `${CALENDAR_WORD_EDGE}(?:щопонеділка|щопонеділок|кожного\\s+понеділка|кожен\\s+понеділок)${CALENDAR_WORD_END}`,
      'iu',
    ),
    resolve: () => ({ kind: 'weekly', byDay: 'MO', rrule: 'RRULE:FREQ=WEEKLY;BYDAY=MO' }),
  },
  {
    pattern: new RegExp(
      `${CALENDAR_WORD_EDGE}(?:щовівторка|кожного\\s+вівторка|кожен\\s+вівторок)${CALENDAR_WORD_END}`,
      'iu',
    ),
    resolve: () => ({ kind: 'weekly', byDay: 'TU', rrule: 'RRULE:FREQ=WEEKLY;BYDAY=TU' }),
  },
  {
    pattern: new RegExp(
      `${CALENDAR_WORD_EDGE}(?:щосереди|кожної\\s+середи|кожну\\s+середу)${CALENDAR_WORD_END}`,
      'iu',
    ),
    resolve: () => ({ kind: 'weekly', byDay: 'WE', rrule: 'RRULE:FREQ=WEEKLY;BYDAY=WE' }),
  },
  {
    pattern: new RegExp(
      `${CALENDAR_WORD_EDGE}(?:щочетверга|кожного\\s+четверга|кожен\\s+четвер)${CALENDAR_WORD_END}`,
      'iu',
    ),
    resolve: () => ({ kind: 'weekly', byDay: 'TH', rrule: 'RRULE:FREQ=WEEKLY;BYDAY=TH' }),
  },
  {
    pattern: new RegExp(
      `${CALENDAR_WORD_EDGE}(?:щоп[''']?ятниці|щопятницы|кожної\\s+п[''']?ятниці|кожну\\s+п[''']?ятницю)${CALENDAR_WORD_END}`,
      'iu',
    ),
    resolve: () => ({ kind: 'weekly', byDay: 'FR', rrule: 'RRULE:FREQ=WEEKLY;BYDAY=FR' }),
  },
  {
    pattern: new RegExp(
      `${CALENDAR_WORD_EDGE}(?:щосуботи|кожної\\s+суботи|кожну\\s+суботу)${CALENDAR_WORD_END}`,
      'iu',
    ),
    resolve: () => ({ kind: 'weekly', byDay: 'SA', rrule: 'RRULE:FREQ=WEEKLY;BYDAY=SA' }),
  },
  {
    pattern: new RegExp(
      `${CALENDAR_WORD_EDGE}(?:щонеділі|кожної\\s+неділі|кожну\\s+неділю)${CALENDAR_WORD_END}`,
      'iu',
    ),
    resolve: () => ({ kind: 'weekly', byDay: 'SU', rrule: 'RRULE:FREQ=WEEKLY;BYDAY=SU' }),
  },
];

/** Strip recurring schedule phrases from title cleaning. */
export const CALENDAR_RECURRENCE_TITLE_STRIP_PATTERN = new RegExp(
  RECURRENCE_PATTERNS.map((entry) => entry.pattern.source).join('|'),
  'giu',
);

function jsDayFromZonedParts(parts: { year: number; month: number; day: number }, timeZone: string) {
  const ms = zonedLocalToUtcMs({ ...parts, hour: 12, minute: 0, second: 0 }, timeZone);
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(new Date(ms));
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return map[weekday] ?? 0;
}

function computeDayOffsetBetween(referenceNow: Date, targetStartMs: number, timeZone: string) {
  const refYmd = getZonedYmd(referenceNow, timeZone);
  const targetParts = getZonedTimeParts(new Date(targetStartMs), timeZone);
  const refDay = Date.UTC(refYmd.year, refYmd.month - 1, refYmd.day);
  const targetDay = Date.UTC(targetParts.year, targetParts.month - 1, targetParts.day);

  return Math.round((targetDay - refDay) / 86400000);
}

function resolveOccurrenceOnDayOffset(params: {
  dayOffset: number;
  clockMinutes: number;
  durationMs: number;
  referenceNow: Date;
  timeZone: string;
}) {
  const ymd = addDaysToZonedYmd(getZonedYmd(params.referenceNow, params.timeZone), params.dayOffset);
  const startMs = zonedLocalToUtcMs(
    {
      ...ymd,
      hour: Math.floor(params.clockMinutes / 60),
      minute: params.clockMinutes % 60,
      second: 0,
    },
    params.timeZone,
  );
  const endMs = startMs + params.durationMs;

  return {
    startMs,
    endMs,
    explicitDayOffset: params.dayOffset,
  };
}

function resolveNextWeeklyOccurrence(params: {
  weekday: CalendarWeekdayCode;
  clockMinutes: number;
  durationMs: number;
  referenceNow: Date;
  timeZone: string;
}) {
  const refParts = getZonedTimeParts(params.referenceNow, params.timeZone);
  const refJsDay = jsDayFromZonedParts(refParts, params.timeZone);
  const targetJsDay = WEEKDAY_TO_JS[params.weekday];
  let daysUntil = (targetJsDay - refJsDay + 7) % 7;

  const todayOccurrence = resolveOccurrenceOnDayOffset({
    dayOffset: 0,
    clockMinutes: params.clockMinutes,
    durationMs: params.durationMs,
    referenceNow: params.referenceNow,
    timeZone: params.timeZone,
  });

  if (daysUntil === 0 && todayOccurrence.startMs <= params.referenceNow.getTime()) {
    daysUntil = 7;
  }

  return resolveOccurrenceOnDayOffset({
    dayOffset: daysUntil,
    clockMinutes: params.clockMinutes,
    durationMs: params.durationMs,
    referenceNow: params.referenceNow,
    timeZone: params.timeZone,
  });
}

function resolveNextDailyOccurrence(params: {
  clockMinutes: number;
  durationMs: number;
  referenceNow: Date;
  timeZone: string;
}) {
  const todayOccurrence = resolveOccurrenceOnDayOffset({
    dayOffset: 0,
    clockMinutes: params.clockMinutes,
    durationMs: params.durationMs,
    referenceNow: params.referenceNow,
    timeZone: params.timeZone,
  });

  if (todayOccurrence.startMs > params.referenceNow.getTime()) {
    return todayOccurrence;
  }

  return resolveOccurrenceOnDayOffset({
    dayOffset: 1,
    clockMinutes: params.clockMinutes,
    durationMs: params.durationMs,
    referenceNow: params.referenceNow,
    timeZone: params.timeZone,
  });
}

export function extractCalendarCreateRecurrence(
  transcript: string,
  referenceNow = new Date(),
  timeZone = getExecutiveCalendarTimezone(),
): CalendarCreateRecurrenceExtraction | null {
  const normalized = transcript.trim();

  if (!normalized) {
    return null;
  }

  const ctx: RecurrenceResolveContext = { referenceNow, timeZone };
  let best: { index: number; length: number; recurrence: ParsedCalendarRecurrence } | null = null;

  for (const entry of RECURRENCE_PATTERNS) {
    const match = normalized.match(entry.pattern);

    if (!match || match.index === undefined) {
      continue;
    }

    const recurrence = entry.resolve(match, ctx);

    if (!best || match[0].length > best.length) {
      best = {
        index: match.index,
        length: match[0].length,
        recurrence,
      };
    }
  }

  if (!best) {
    return null;
  }

  const transcriptWithoutRecurrence = `${normalized.slice(0, best.index)} ${normalized.slice(best.index + best.length)}`
    .replace(/\s+/g, ' ')
    .trim();

  return {
    recurrence: best.recurrence,
    transcriptWithoutRecurrence,
  };
}

export function applyRecurrenceToCreateSchedule(params: {
  schedule: Extract<CalendarCreateScheduleResult, { ok: true }>;
  recurrence: ParsedCalendarRecurrence;
  referenceNow: Date;
  timeZone?: string;
}): Extract<CalendarCreateScheduleResult, { ok: true }> {
  const timeZone = params.timeZone ?? getExecutiveCalendarTimezone();
  const durationMs = params.schedule.endMs - params.schedule.startMs;
  const startParts = getZonedTimeParts(new Date(params.schedule.startMs), timeZone);
  const clockMinutes = startParts.hour * 60 + startParts.minute;

  if (params.recurrence.kind === 'daily' || params.recurrence.kind === 'monthly') {
    const next = resolveNextDailyOccurrence({
      clockMinutes,
      durationMs,
      referenceNow: params.referenceNow,
      timeZone,
    });

    return {
      ok: true,
      startMs: next.startMs,
      endMs: next.endMs,
      hasExplicitTime: true,
      explicitDayOffset: next.explicitDayOffset,
    };
  }

  if (params.recurrence.byDay) {
    const next = resolveNextWeeklyOccurrence({
      weekday: params.recurrence.byDay,
      clockMinutes,
      durationMs,
      referenceNow: params.referenceNow,
      timeZone,
    });

    return {
      ok: true,
      startMs: next.startMs,
      endMs: next.endMs,
      hasExplicitTime: true,
      explicitDayOffset: next.explicitDayOffset,
    };
  }

  const dayOffset = computeDayOffsetBetween(
    params.referenceNow,
    params.schedule.startMs,
    timeZone,
  );

  return {
    ...params.schedule,
    explicitDayOffset: dayOffset,
  };
}

export function parseCalendarCreateScheduleWithRecurrence(
  transcript: string,
  referenceNow: Date,
  timeZone = getExecutiveCalendarTimezone(),
): {
  recurrence: ParsedCalendarRecurrence | null;
  scheduleText: string;
  pointSchedule: ReturnType<typeof parseCalendarPointSchedule>;
} {
  const recurrenceExtraction = extractCalendarCreateRecurrence(transcript);
  const scheduleText = recurrenceExtraction?.transcriptWithoutRecurrence ?? transcript;
  const pointSchedule = parseCalendarPointSchedule(scheduleText, referenceNow, timeZone);

  return {
    recurrence: recurrenceExtraction?.recurrence ?? null,
    scheduleText,
    pointSchedule,
  };
}
