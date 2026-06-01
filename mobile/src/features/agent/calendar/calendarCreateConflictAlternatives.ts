import {
  buildCalendarCreateConflictReplyWithAlternatives,
  resolveConflictDayOffset,
} from '@/src/features/agent/calendar/calendarConflictReplies';
import type { CalendarScheduleConflict } from '@/src/features/agent/calendar/calendarScheduleConflictCore';
import { fetchTimedEventsNearScheduleWindow } from '@/src/features/agent/calendar/calendarScheduleConflict';
import { formatDateKey } from '@/src/features/agent/calendarIntelligence/zonedEventTime';
import { normalizeCalendarEvents } from '@/src/features/agent/calendarIntelligence/normalizeEvents';
import { getFreeWindows } from '@/src/features/agent/calendarIntelligence/scheduleHelpers';
import {
  addDaysToZonedYmd,
  getExecutiveCalendarTimezone,
  getZonedDayRange,
  getZonedTimeParts,
  getZonedYmd,
  zonedLocalToUtcMs,
} from '@/src/features/agent/calendar/calendarTimezone';
import { parseGoogleCalendarInstant } from '@/src/features/agent/calendar/calendarTime';
import { formatTimeInExecutiveTimezone } from '@/src/features/agent/calendar/calendarTime';
import type { CalendarConflictLocale } from '@/src/features/agent/calendar/calendarConflictReplies';
import type { CalendarFreeSlot } from '@/src/features/agent/calendarIntelligence/types';

function formatSlotRange(slot: CalendarFreeSlot, timeZone: string) {
  const startLabel = formatTimeInExecutiveTimezone(slot.startISO, timeZone);
  const endLabel = formatTimeInExecutiveTimezone(slot.endISO, timeZone);

  return `${startLabel}–${endLabel}`;
}

function buildTomorrowSameTimeLabel(params: {
  proposedStartMs: number;
  referenceNow: Date;
  locale: CalendarConflictLocale;
}) {
  const timeZone = getExecutiveCalendarTimezone();
  const parts = getZonedTimeParts(new Date(params.proposedStartMs), timeZone);
  const tomorrowYmd = addDaysToZonedYmd(getZonedYmd(params.referenceNow, timeZone), 1);
  const startMs = zonedLocalToUtcMs(
    {
      ...tomorrowYmd,
      hour: parts.hour,
      minute: parts.minute,
      second: 0,
    },
    timeZone,
  );
  const endMs = startMs + 60 * 60_000;
  const startLabel = formatTimeInExecutiveTimezone(new Date(startMs).toISOString(), timeZone);
  const endLabel = formatTimeInExecutiveTimezone(new Date(endMs).toISOString(), timeZone);

  if (params.locale === 'uk') {
    return `Завтра о ${startLabel}–${endLabel}`;
  }

  if (params.locale === 'ru') {
    return `Завтра в ${startLabel}–${endLabel}`;
  }

  return `Tomorrow ${startLabel}–${endLabel}`;
}

export async function buildCreateConflictAlternativesBundle(params: {
  locale: CalendarConflictLocale;
  proposedTitle: string;
  conflict: CalendarScheduleConflict;
  proposedStartMs: number;
  proposedEndMs: number;
  referenceNow: Date;
}) {
  const timeZone = getExecutiveCalendarTimezone();
  const dayOffset = resolveConflictDayOffset(params.proposedStartMs, params.referenceNow);
  const range = getZonedDayRange(params.referenceNow, dayOffset, timeZone);
  const targetYmd = addDaysToZonedYmd(getZonedYmd(params.referenceNow, timeZone), dayOffset);
  const day = {
    dateKey: formatDateKey(targetYmd),
    dayOffset,
    range,
    timezone: timeZone,
  };

  const { events, fetchOk } = await fetchTimedEventsNearScheduleWindow({
    referenceNow: params.referenceNow,
    proposedStartMs: params.proposedStartMs,
    proposedEndMs: params.proposedEndMs,
  });

  const durationMinutes = Math.max(
    15,
    Math.round((params.proposedEndMs - params.proposedStartMs) / 60_000),
  );

  let slotLabels: string[] = [];
  let alternativeStartMs: number[] = [];

  if (fetchOk) {
    const normalized = normalizeCalendarEvents(events, timeZone);
    const slots = getFreeWindows(normalized, day, params.referenceNow, durationMinutes);
    slotLabels = slots.slice(0, 2).map((slot) => formatSlotRange(slot, timeZone));
    alternativeStartMs = slots
      .slice(0, 3)
      .map((slot) => parseGoogleCalendarInstant(slot.startISO) ?? 0)
      .filter((value) => value > 0);
  }

  const tomorrowLabel = buildTomorrowSameTimeLabel({
    proposedStartMs: params.proposedStartMs,
    referenceNow: params.referenceNow,
    locale: params.locale,
  });

  const tomorrowParts = getZonedTimeParts(new Date(params.proposedStartMs), timeZone);
  const tomorrowYmd = addDaysToZonedYmd(getZonedYmd(params.referenceNow, timeZone), 1);
  const tomorrowStartMs = zonedLocalToUtcMs(
    {
      ...tomorrowYmd,
      hour: tomorrowParts.hour,
      minute: tomorrowParts.minute,
      second: 0,
    },
    timeZone,
  );

  if (!alternativeStartMs.includes(tomorrowStartMs)) {
    alternativeStartMs.push(tomorrowStartMs);
  }

  const reply = buildCalendarCreateConflictReplyWithAlternatives({
    locale: params.locale,
    proposedTitle: params.proposedTitle,
    conflict: params.conflict,
    proposedStartMs: params.proposedStartMs,
    proposedEndMs: params.proposedEndMs,
    slotLabels,
    tomorrowLabel,
  });

  return {
    reply,
    alternativeStartMs,
  };
}
