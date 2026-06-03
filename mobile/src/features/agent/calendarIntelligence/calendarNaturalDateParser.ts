import { logDateParser } from '@/src/features/agent/calendarIntelligence/calendarDateParseDiagnostics';
import { formatDateKey } from '@/src/features/agent/calendarIntelligence/zonedEventTime';
import {
  CALENDAR_WORD_EDGE,
  CALENDAR_WORD_END,
} from '@/src/features/agent/calendarIntelligence/calendarTextBoundaries';
import {
  addDaysToZonedYmd,
  getZonedTimeParts,
  getZonedYmd,
  zonedLocalToUtcMs,
} from '@/src/features/agent/calendar/calendarTimezone';
import { DEFAULT_CALENDAR_INTELLIGENCE_TIMEZONE } from '@/src/features/agent/calendarIntelligence/resolveTargetDay';

const NATURAL_PHRASE_END = '(?:$|[\\s,.;:!?—-])';

const WEEKDAY_PREFIXES: Array<[string, number]> = [
  ['понеділ', 1],
  ['poniedil', 1],
  ['понедель', 1],
  ['monday', 1],
  ['вівтор', 2],
  ['vivtor', 2],
  ['вторник', 2],
  ['tuesday', 2],
  ['sered', 3],
  ['серед', 3],
  ['сред', 3],
  ['среда', 3],
  ['wednesday', 3],
  ['четвер', 4],
  ['chetver', 4],
  ['thursday', 4],
  ['п\'ятниц', 5],
  ['пятниц', 5],
  ['piatnyts', 5],
  ['friday', 5],
  ['субот', 6],
  ['суббот', 6],
  ['saturday', 6],
  ['неділ', 0],
  ['nedil', 0],
  ['воскрес', 0],
  ['sunday', 0],
];

const WEEKDAY_PATTERN =
  /(?:понеділ(?:ок|ка|ку)?|понедельник(?:а|у)?|вівтор(?:ок|ка|ку)?|вторник(?:а|у)?|sered[auy]?|серед[ау]|среда|четвер(?:г|а|у)?|chetver|п(?:'|')?ятниц[ау]|пятниц[ау]|субот[ау]|суббот[ау]|воскрес(?:енье|енья|енью)?|неділ[іi]|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/iu;

export type NaturalRelativeOffset = {
  offsetMs: number;
  kind: 'minutes' | 'hours' | 'days';
  amount: number;
};

export type NaturalDayResolution = {
  dayOffset: number;
  source:
    | 'today'
    | 'tomorrow'
    | 'day_after_tomorrow'
    | 'weekday'
    | 'next_weekday'
    | 'weekend'
    | 'relative_days'
    | null;
  weekdayIndex?: number;
};

function normalizeText(text: string) {
  return text.trim().replace(/\s+/g, ' ');
}

export function getZonedWeekdayIndex(instant: Date, timeZone: string) {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(instant);
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

export function resolveWeekdayOffset(params: {
  targetWeekday: number;
  referenceNow: Date;
  timeZone: string;
  forceNextWeek: boolean;
}) {
  const anchorWeekday = getZonedWeekdayIndex(params.referenceNow, params.timeZone);
  let delta = (params.targetWeekday - anchorWeekday + 7) % 7;

  if (params.forceNextWeek) {
    return delta === 0 ? 7 : delta;
  }

  return delta === 0 ? 7 : delta;
}

export function resolveWeekdayTargetYmd(params: {
  weekdayIndex: number;
  referenceNow: Date;
  timeZone: string;
  forceNextWeek?: boolean;
}) {
  const dayOffset = resolveWeekdayOffset({
    targetWeekday: params.weekdayIndex,
    referenceNow: params.referenceNow,
    timeZone: params.timeZone,
    forceNextWeek: params.forceNextWeek ?? false,
  });

  return addDaysToZonedYmd(getZonedYmd(params.referenceNow, params.timeZone), dayOffset);
}

export function parseRelativeTimeOffset(transcript: string): NaturalRelativeOffset | null {
  const text = normalizeText(transcript);

  const minuteMatch = text.match(
    new RegExp(
      `(?:^|[\\s,.;:!?—-]+)(?:через|through|in)\\s+(\\d+)\\s*(?:минут(?:ы)?|хвилин(?:и|у)?|хв(?:илин)?|мин(?:ут)?|minutes?|min)${NATURAL_PHRASE_END}`,
      'iu',
    ),
  );

  if (minuteMatch) {
    const amount = Number(minuteMatch[1]);
    return { offsetMs: amount * 60_000, kind: 'minutes', amount };
  }

  const hourMatch = text.match(
    new RegExp(
      `(?:^|[\\s,.;:!?—-]+)(?:через|through|in)\\s+(\\d+)\\s*(?:годин(?:и|у|ы)?|час(?:а|ов|у)?|hours?|hrs?)${NATURAL_PHRASE_END}`,
      'iu',
    ),
  );

  if (hourMatch) {
    const amount = Number(hourMatch[1]);
    return { offsetMs: amount * 60 * 60_000, kind: 'hours', amount };
  }

  const singleHourMatch = text.match(
    new RegExp(
      `(?:^|[\\s,.;:!?—-]+)(?:через|through|in)\\s+(?:годину|год|година|an?\\s+hour|one\\s+hour)${NATURAL_PHRASE_END}`,
      'iu',
    ),
  );

  if (singleHourMatch) {
    return { offsetMs: 60 * 60_000, kind: 'hours', amount: 1 };
  }

  const dayMatch = text.match(
    new RegExp(
      `(?:^|[\\s,.;:!?—-]+)(?:через|through)\\s+(\\d+)\\s*(?:дн(?:я|ей|ів|і|i|я|і)?|дні|days?)${NATURAL_PHRASE_END}`,
      'iu',
    ),
  );

  if (dayMatch) {
    const amount = Number(dayMatch[1]);
    return { offsetMs: amount * 24 * 60 * 60_000, kind: 'days', amount };
  }

  const singleDayMatch = text.match(
    new RegExp(`(?:^|[\\s,.;:!?—-]+)(?:через|through)\\s+(?:день|day)${NATURAL_PHRASE_END}`, 'iu'),
  );

  if (singleDayMatch) {
    return { offsetMs: 24 * 60 * 60_000, kind: 'days', amount: 1 };
  }

  return null;
}

function matchWeekdayToken(text: string) {
  const token = text.trim().toLowerCase();

  if (!token) {
    return null;
  }

  for (const [prefix, index] of WEEKDAY_PREFIXES) {
    if (token.startsWith(prefix)) {
      return index;
    }
  }

  const match = token.match(WEEKDAY_PATTERN);

  if (!match) {
    return null;
  }

  const matched = match[0].toLowerCase();

  for (const [prefix, index] of WEEKDAY_PREFIXES) {
    if (matched.startsWith(prefix)) {
      return index;
    }
  }

  return null;
}

export function parseNaturalDayOffset(
  transcript: string,
  referenceNow: Date,
  timeZone = DEFAULT_CALENDAR_INTELLIGENCE_TIMEZONE,
): NaturalDayResolution | null {
  const text = normalizeText(transcript);

  if (new RegExp(`${CALENDAR_WORD_EDGE}(?:сьогодні|сегодня|today)${CALENDAR_WORD_END}`, 'iu').test(text)) {
    return { dayOffset: 0, source: 'today' };
  }

  if (new RegExp(`${CALENDAR_WORD_EDGE}(?:завтра|tomorrow)${CALENDAR_WORD_END}`, 'iu').test(text)) {
    return { dayOffset: 1, source: 'tomorrow' };
  }

  if (
    new RegExp(`${CALENDAR_WORD_EDGE}(?:післязавтра|послезавтра|day\\s+after\\s+tomorrow)${CALENDAR_WORD_END}`, 'iu').test(
      text,
    )
  ) {
    return { dayOffset: 2, source: 'day_after_tomorrow' };
  }

  if (
    new RegExp(
      `(?:^|[\\s,.;:!?—-]+)(?:на\\s+)?(?:вихідних|выходных|weekend)${NATURAL_PHRASE_END}`,
      'iu',
    ).test(text)
  ) {
    const anchorWeekday = getZonedWeekdayIndex(referenceNow, timeZone);

    if (anchorWeekday === 6 || anchorWeekday === 0) {
      return { dayOffset: 0, source: 'weekend', weekdayIndex: anchorWeekday };
    }

    const delta = (6 - anchorWeekday + 7) % 7;

    return { dayOffset: delta, source: 'weekend', weekdayIndex: 6 };
  }

  const nextWeekdayMatch = text.match(
    /(?:наступного|наступної|наступний|следующ(?:ий|его|ую)|next)\s+(?:на\s+)?([\p{L}-]+)/iu,
  );

  if (nextWeekdayMatch?.[1]) {
    const weekdayIndex = matchWeekdayToken(nextWeekdayMatch[1]);

    if (weekdayIndex !== null) {
      return {
        dayOffset: resolveWeekdayOffset({
          targetWeekday: weekdayIndex,
          referenceNow,
          timeZone,
          forceNextWeek: true,
        }),
        source: 'next_weekday',
        weekdayIndex,
      };
    }
  }

  const weekdayPrepositionMatch = text.match(
    /(?:^|[\s,.;:!?—-]+)(?:в|на|on)\s+(?:наступного|наступній|наступний|следующ(?:ий|его|ую))?\s*([\p{L}-]+)/iu,
  );

  if (weekdayPrepositionMatch?.[1]) {
    const weekdayIndex = matchWeekdayToken(weekdayPrepositionMatch[1]);

    if (weekdayIndex !== null) {
      const forceNextWeek = /(?:наступного|наступній|наступний|следующ)/iu.test(
        weekdayPrepositionMatch[0],
      );

      return {
        dayOffset: resolveWeekdayOffset({
          targetWeekday: weekdayIndex,
          referenceNow,
          timeZone,
          forceNextWeek,
        }),
        source: forceNextWeek ? 'next_weekday' : 'weekday',
        weekdayIndex,
      };
    }
  }

  const bareWeekdayIndex = matchWeekdayToken(text);

  if (bareWeekdayIndex !== null && /(?:^|[\s,.;:!?—-]+)(?:в|на|on)\s+/iu.test(text)) {
    return {
      dayOffset: resolveWeekdayOffset({
        targetWeekday: bareWeekdayIndex,
        referenceNow,
        timeZone,
        forceNextWeek: false,
      }),
      source: 'weekday',
      weekdayIndex: bareWeekdayIndex,
    };
  }

  const relativeDays = parseRelativeTimeOffset(text);

  if (relativeDays?.kind === 'days') {
    return {
      dayOffset: relativeDays.amount,
      source: 'relative_days',
    };
  }

  return null;
}

export function stripNaturalDatePhrases(text: string) {
  let cleaned = text;
  const unitEnd = NATURAL_PHRASE_END;
  const weekdayForms =
    'понеділ(?:ок|ка|ку)|понедельник(?:а|у)?|вівтор(?:ок|ка|ку)|вторник(?:а|у)?|sered[auy]?|серед[ау]|среда|четвер(?:г|а|у)?|chetver|п(?:\'|\')?ятниц[ау]|пятниц[ау]|субот[ау]|суббот[ау]|воскрес(?:енье|енья|енью)?|неділ[іi]|monday|tuesday|wednesday|thursday|friday|saturday|sunday';
  const patterns = [
    new RegExp(`(?:^|[\\s,.;:!?—-]+)(?:через|through)\\s+\\d+\\s*(?:минут(?:ы)?|хвилин(?:и|у)?|хв(?:илин)?|мин(?:ут)?|minutes?|min)${unitEnd}`, 'giu'),
    new RegExp(`(?:^|[\\s,.;:!?—-]+)(?:через|through)\\s+\\d+\\s*(?:годин(?:и|у|ы)?|час(?:а|ов|у)?|hours?|hrs?)${unitEnd}`, 'giu'),
    new RegExp(`(?:^|[\\s,.;:!?—-]+)(?:через|through)\\s+(?:годину|год|година|an?\\s+hour|one\\s+hour)${unitEnd}`, 'giu'),
    new RegExp(`(?:^|[\\s,.;:!?—-]+)(?:через|through)\\s+\\d+\\s*(?:дн(?:я|ей|ів|і|i|я)?|дні|days?)${unitEnd}`, 'giu'),
    new RegExp(`(?:^|[\\s,.;:!?—-]+)(?:через|through)\\s+(?:день|day)${unitEnd}`, 'giu'),
    new RegExp(`${CALENDAR_WORD_EDGE}(?:післязавтра|послезавтра|day\\s+after\\s+tomorrow)${CALENDAR_WORD_END}`, 'giu'),
    new RegExp(`(?:^|[\\s,.;:!?—-]+)(?:на\\s+)?(?:вихідних|выходных|weekend)${unitEnd}`, 'giu'),
    new RegExp(`(?:наступного|наступної|наступний|следующ(?:ий|его|ую)|next)\\s+(?:на\\s+)?(?:${weekdayForms})`, 'giu'),
    new RegExp(`(?:^|[\\s,.;:!?—-]+)(?:в|на|on)\\s+(?:наступного|наступній|наступний|следующ(?:ий|его|ую))?\\s*(?:${weekdayForms})`, 'giu'),
  ];

  for (const pattern of patterns) {
    cleaned = cleaned.replace(pattern, ' ');
  }

  return cleaned.replace(/\s+/g, ' ').trim();
}

export function formatResolvedDateLabel(instantMs: number, timeZone: string) {
  const ymd = getZonedYmd(new Date(instantMs), timeZone);

  return formatDateKey(ymd);
}

export function formatResolvedTimeLabel(instantMs: number, timeZone: string) {
  const parts = getZonedTimeParts(new Date(instantMs), timeZone);
  const pad = (value: number) => String(value).padStart(2, '0');

  return `${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function computeDayOffsetFromInstant(
  referenceNow: Date,
  instantMs: number,
  timeZone: string,
) {
  const anchorYmd = getZonedYmd(referenceNow, timeZone);
  const targetKey = formatDateKey(getZonedYmd(new Date(instantMs), timeZone));

  for (let offset = 0; offset <= 14; offset += 1) {
    if (formatDateKey(addDaysToZonedYmd(anchorYmd, offset)) === targetKey) {
      return offset;
    }
  }

  return 0;
}

export function resolveNaturalCalendarInstant(params: {
  transcript: string;
  referenceNow: Date;
  timeZone?: string;
  clockMinutes?: number | null;
}) {
  const timeZone = params.timeZone ?? DEFAULT_CALENDAR_INTELLIGENCE_TIMEZONE;
  const relative = parseRelativeTimeOffset(params.transcript);
  const dayResolution = parseNaturalDayOffset(params.transcript, params.referenceNow, timeZone);

  let startMs: number | null = null;

  if (relative && (relative.kind === 'minutes' || relative.kind === 'hours') && params.clockMinutes == null) {
    startMs = params.referenceNow.getTime() + relative.offsetMs;
  } else if (relative?.kind === 'days' && params.clockMinutes == null) {
    startMs = params.referenceNow.getTime() + relative.offsetMs;
  } else if (params.clockMinutes != null) {
    const dayOffset = dayResolution?.dayOffset ?? 0;
    const anchorYmd = addDaysToZonedYmd(getZonedYmd(params.referenceNow, timeZone), dayOffset);
    startMs = zonedLocalToUtcMs(
      {
        ...anchorYmd,
        hour: Math.floor(params.clockMinutes / 60),
        minute: params.clockMinutes % 60,
        second: 0,
      },
      timeZone,
    );
  } else if (dayResolution && relative?.kind === 'days') {
    const anchorYmd = addDaysToZonedYmd(getZonedYmd(params.referenceNow, timeZone), dayResolution.dayOffset);
    const nowParts = getZonedTimeParts(params.referenceNow, timeZone);
    startMs = zonedLocalToUtcMs(
      {
        ...anchorYmd,
        hour: nowParts.hour,
        minute: nowParts.minute,
        second: 0,
      },
      timeZone,
    );
  }

  if (startMs !== null) {
    logDateParser({
      original: params.transcript,
      resolvedDate: formatResolvedDateLabel(startMs, timeZone),
      resolvedTime: formatResolvedTimeLabel(startMs, timeZone),
    });
  }

  return {
    startMs,
    dayResolution,
    relative,
  };
}

export function resolveNaturalDayOffsetForContext(
  transcript: string,
  referenceNow: Date,
  timeZone = DEFAULT_CALENDAR_INTELLIGENCE_TIMEZONE,
): number | null {
  const resolution = parseNaturalDayOffset(transcript, referenceNow, timeZone);

  if (!resolution) {
    return null;
  }

  logDateParser({
    original: transcript,
    resolvedDate: formatDateKey(addDaysToZonedYmd(getZonedYmd(referenceNow, timeZone), resolution.dayOffset)),
    resolvedTime: null,
  });

  return resolution.dayOffset;
}
