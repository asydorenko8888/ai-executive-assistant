export type ZonedYmd = {
  year: number;
  month: number;
  day: number;
};

export type ZonedDayRange = {
  timezone: string;
  dayOffset: number;
  rangeStart: string;
  rangeEnd: string;
  rangeStartMs: number;
  rangeEndMs: number;
  timeMin: string;
  timeMax: string;
};

const DEFAULT_EXECUTIVE_CALENDAR_TIMEZONE = 'America/Chicago';

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

export function getExecutiveCalendarTimezone() {
  try {
    // Lazy load so pure calendar modules can be unit-tested without Expo.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { env } = require('@/src/shared/config/env') as typeof import('@/src/shared/config/env');
    const configured = env.calendarTimezone?.trim();

    return configured || DEFAULT_EXECUTIVE_CALENDAR_TIMEZONE;
  } catch {
    return DEFAULT_EXECUTIVE_CALENDAR_TIMEZONE;
  }
}

export function getZonedYmd(instant: Date, timeZone: string): ZonedYmd {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);

  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  const day = Number(parts.find((part) => part.type === 'day')?.value);

  return { year, month, day };
}

export function addDaysToZonedYmd(ymd: ZonedYmd, dayOffset: number): ZonedYmd {
  const shifted = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day + dayOffset));

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

export function getZonedTimeParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);

  return {
    year: Number(parts.find((part) => part.type === 'year')?.value),
    month: Number(parts.find((part) => part.type === 'month')?.value),
    day: Number(parts.find((part) => part.type === 'day')?.value),
    hour: Number(parts.find((part) => part.type === 'hour')?.value),
    minute: Number(parts.find((part) => part.type === 'minute')?.value),
    second: Number(parts.find((part) => part.type === 'second')?.value),
  };
}

/** Convert a civil datetime in `timeZone` to UTC epoch milliseconds. */
export function zonedLocalToUtcMs(
  components: ZonedYmd & { hour?: number; minute?: number; second?: number },
  timeZone: string,
): number {
  const target = {
    year: components.year,
    month: components.month,
    day: components.day,
    hour: components.hour ?? 0,
    minute: components.minute ?? 0,
    second: components.second ?? 0,
  };

  let utcGuess = Date.UTC(
    target.year,
    target.month - 1,
    target.day,
    target.hour,
    target.minute,
    target.second,
  );

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const observed = getZonedTimeParts(new Date(utcGuess), timeZone);
    const desiredLocalAsUtc = Date.UTC(
      target.year,
      target.month - 1,
      target.day,
      target.hour,
      target.minute,
      target.second,
    );
    const observedLocalAsUtc = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second,
    );
    const delta = desiredLocalAsUtc - observedLocalAsUtc;

    if (delta === 0) {
      return utcGuess;
    }

    utcGuess += delta;
  }

  return utcGuess;
}

function formatRfc3339FromUtcMs(utcMs: number, timeZone: string) {
  const parts = getZonedTimeParts(new Date(utcMs), timeZone);
  const offsetFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset',
  });
  const offsetPart = offsetFormatter
    .formatToParts(new Date(utcMs))
    .find((part) => part.type === 'timeZoneName')?.value;
  const offset =
    offsetPart?.replace('GMT', '').replace('UTC', '').trim() ||
    '+00:00';

  const normalizedOffset =
    offset === '' ? '+00:00' : offset.startsWith('+') || offset.startsWith('-') ? offset : `+${offset}`;

  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}T${pad2(parts.hour)}:${pad2(parts.minute)}:${pad2(parts.second)}${normalizedOffset}`;
}

export function getZonedDayRange(
  referenceNow: Date,
  dayOffset: number,
  timeZone = getExecutiveCalendarTimezone(),
): ZonedDayRange {
  const anchorYmd = getZonedYmd(referenceNow, timeZone);
  const targetYmd = addDaysToZonedYmd(anchorYmd, dayOffset);
  const nextYmd = addDaysToZonedYmd(targetYmd, 1);
  const rangeStartMs = zonedLocalToUtcMs(targetYmd, timeZone);
  const rangeEndMs = zonedLocalToUtcMs(nextYmd, timeZone);

  return {
    timezone: timeZone,
    dayOffset,
    rangeStart: new Date(rangeStartMs).toISOString(),
    rangeEnd: new Date(rangeEndMs).toISOString(),
    rangeStartMs,
    rangeEndMs,
    timeMin: formatRfc3339FromUtcMs(rangeStartMs, timeZone),
    timeMax: formatRfc3339FromUtcMs(rangeEndMs, timeZone),
  };
}

export function resolveZonedDayOffsetForInstant(
  instantIso: string,
  referenceNow: Date,
  timeZone = getExecutiveCalendarTimezone(),
): number | null {
  const parsed = Date.parse(instantIso);

  if (Number.isNaN(parsed)) {
    return null;
  }

  const anchorYmd = getZonedYmd(referenceNow, timeZone);
  const eventYmd = getZonedYmd(new Date(parsed), timeZone);
  const anchorDay = Date.UTC(anchorYmd.year, anchorYmd.month - 1, anchorYmd.day);
  const eventDay = Date.UTC(eventYmd.year, eventYmd.month - 1, eventYmd.day);

  return Math.round((eventDay - anchorDay) / 86400000);
}
