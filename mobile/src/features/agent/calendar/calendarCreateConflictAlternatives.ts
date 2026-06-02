import {
  buildCalendarConflictAlternativesOnlyReply,
  formatConflictSlotLabelWithDay,
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
import type { CalendarConflictLocale } from '@/src/features/agent/calendar/calendarConflictReplies';
import type { CalendarFreeSlot } from '@/src/features/agent/calendarIntelligence/types';

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

  let optionLabels: string[] = [];
  let alternativeStartMs: number[] = [];

  if (fetchOk) {
    const normalized = normalizeCalendarEvents(events, timeZone);
    const slots = getFreeWindows(normalized, day, params.referenceNow, durationMinutes);
    optionLabels = slots
      .slice(0, 3)
      .map((slot) =>
        formatConflictSlotLabelWithDay({
          slot,
          referenceNow: params.referenceNow,
          locale: params.locale,
          timeZone,
        }),
      );
    alternativeStartMs = slots
      .slice(0, 3)
      .map((slot) => parseGoogleCalendarInstant(slot.startISO) ?? 0)
      .filter((value) => value > 0);
  }

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
  const tomorrowEndMs = tomorrowStartMs + durationMinutes * 60_000;
  const tomorrowStartMinutes = tomorrowParts.hour * 60 + tomorrowParts.minute;
  const tomorrowSlot: CalendarFreeSlot = {
    startISO: new Date(tomorrowStartMs).toISOString(),
    endISO: new Date(tomorrowEndMs).toISOString(),
    startMinutes: tomorrowStartMinutes,
    endMinutes: tomorrowStartMinutes + durationMinutes,
    durationMinutes,
  };
  const tomorrowLabel = formatConflictSlotLabelWithDay({
    slot: tomorrowSlot,
    referenceNow: params.referenceNow,
    locale: params.locale,
    timeZone,
  });

  if (!optionLabels.includes(tomorrowLabel)) {
    optionLabels.push(tomorrowLabel);
  }

  if (!alternativeStartMs.includes(tomorrowStartMs)) {
    alternativeStartMs.push(tomorrowStartMs);
  }

  const reply = buildCalendarConflictAlternativesOnlyReply({
    locale: params.locale,
    optionLabels,
  });

  return {
    reply,
    alternativeStartMs,
  };
}
