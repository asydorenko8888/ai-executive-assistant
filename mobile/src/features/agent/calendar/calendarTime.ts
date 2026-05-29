/**
 * Timezone-aware helpers for Google Calendar ISO datetimes.
 * Preserves offset in RFC3339 strings; compares instants against local "now".
 */

import { getExecutiveCalendarTimezone } from '@/src/features/agent/calendar/calendarTimezone';

export function getBrowserTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function parseGoogleCalendarInstant(isoValue: string): number | null {
  const trimmed = isoValue.trim();

  if (!trimmed) {
    return null;
  }

  // Google date-only all-day values have no offset — treat as local calendar day start.
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split('-').map(Number);
    const localDate = new Date(year, month - 1, day, 0, 0, 0, 0);
    return localDate.getTime();
  }

  const parsed = Date.parse(trimmed);

  if (Number.isNaN(parsed)) {
    return null;
  }

  return parsed;
}

export function formatInstantForDebug(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.toLocaleString()} (${timestamp})`;
}

export function logCalendarTimeContext(referenceNow = new Date()) {
  console.log('[Calendar Time] browser timezone:', getBrowserTimezone());
  console.log('[Calendar Time] now local:', formatInstantForDebug(referenceNow.getTime()));
}

export function logCalendarEventTimeDebug(params: {
  rawStart: string;
  eventTitle?: string;
  referenceNow?: Date;
}) {
  const now = params.referenceNow ?? new Date();
  const parsedStart = parseGoogleCalendarInstant(params.rawStart);
  const minutesUntilEvent =
    parsedStart === null ? null : Math.round((parsedStart - now.getTime()) / 60000);

  if (params.eventTitle) {
    console.log('[Calendar Time] event:', params.eventTitle);
  }

  console.log('[Calendar Time] event raw start:', params.rawStart);
  console.log(
    '[Calendar Time] event parsed:',
    parsedStart === null ? 'invalid' : formatInstantForDebug(parsedStart),
  );
  console.log(
    '[Calendar Time] minutes until event:',
    minutesUntilEvent === null ? 'n/a' : minutesUntilEvent,
  );
}

export function getLocalStartOfDay(referenceDate: Date) {
  return new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
    0,
    0,
    0,
    0,
  );
}

export function getLocalEndOfDay(referenceDate: Date) {
  const start = getLocalStartOfDay(referenceDate);
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1, 0, 0, 0, 0);
}

function padTimePart(value: number) {
  return String(value).padStart(2, '0');
}

function getLocalTimezoneOffsetForDate(date: Date) {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absoluteMinutes = Math.abs(offsetMinutes);
  const hours = padTimePart(Math.floor(absoluteMinutes / 60));
  const minutes = padTimePart(absoluteMinutes % 60);
  return `${sign}${hours}:${minutes}`;
}

/** RFC3339 in the browser's local timezone (keeps calendar day aligned with the user). */
export function formatLocalRfc3339(date: Date) {
  const year = date.getFullYear();
  const month = padTimePart(date.getMonth() + 1);
  const day = padTimePart(date.getDate());
  const hours = padTimePart(date.getHours());
  const minutes = padTimePart(date.getMinutes());
  const seconds = padTimePart(date.getSeconds());
  const offset = getLocalTimezoneOffsetForDate(date);

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${offset}`;
}

export function getLocalDayBounds(referenceDate: Date) {
  const dayStart = getLocalStartOfDay(referenceDate);
  const dayEnd = getLocalEndOfDay(referenceDate);

  return {
    dayStart,
    dayEnd,
    timeMin: formatLocalRfc3339(dayStart),
    timeMax: formatLocalRfc3339(dayEnd),
  };
}

/** Today through the next 14 days — used for Home / briefing calendar reads. */
export function getCalendarAgendaWindow(referenceDate: Date) {
  const dayStart = getLocalStartOfDay(referenceDate);
  const horizonEnd = new Date(dayStart);
  horizonEnd.setDate(horizonEnd.getDate() + 14);

  return {
    dayStart,
    horizonEnd,
    timeMin: formatLocalRfc3339(dayStart),
    timeMax: formatLocalRfc3339(horizonEnd),
  };
}

export function minutesBetweenTimestamps(startTimestamp: number, endTimestamp: number) {
  return Math.max(0, Math.round((endTimestamp - startTimestamp) / 60000));
}

export function getMinutesUntilEvent(rawStart: string, referenceNow = new Date()) {
  const parsedStart = parseGoogleCalendarInstant(rawStart);

  if (parsedStart === null) {
    return null;
  }

  return Math.round((parsedStart - referenceNow.getTime()) / 60000);
}

export function formatTimeInLocalTimezone(isoValue: string) {
  return formatTimeInExecutiveTimezone(isoValue);
}

export function formatTimeInExecutiveTimezone(isoValue: string, timeZone?: string) {
  const parsed = parseGoogleCalendarInstant(isoValue);

  if (parsed === null) {
    return isoValue;
  }

  return new Date(parsed).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timeZone ?? getExecutiveCalendarTimezone(),
  });
}
