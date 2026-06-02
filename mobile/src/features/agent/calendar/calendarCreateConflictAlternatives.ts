import {
  buildCalendarConflictAlternativesOnlyReply,
  formatConflictSlotLabelWithDay,
  resolveConflictDayOffset,
} from '@/src/features/agent/calendar/calendarConflictReplies';
import { buildConflictAlternativeOptionSlots } from '@/src/features/agent/calendar/calendarConflictAlternativeSlots';
import type { CalendarScheduleConflict } from '@/src/features/agent/calendar/calendarScheduleConflictCore';
import { fetchTimedEventsNearScheduleWindow } from '@/src/features/agent/calendar/calendarScheduleConflict';
import { formatDateKey } from '@/src/features/agent/calendarIntelligence/zonedEventTime';
import { normalizeCalendarEvents } from '@/src/features/agent/calendarIntelligence/normalizeEvents';
import {
  addDaysToZonedYmd,
  getExecutiveCalendarTimezone,
  getZonedDayRange,
  getZonedYmd,
} from '@/src/features/agent/calendar/calendarTimezone';
import { parseGoogleCalendarInstant } from '@/src/features/agent/calendar/calendarTime';
import type { CalendarConflictLocale } from '@/src/features/agent/calendar/calendarConflictReplies';
import type { PreferredTimeRange } from '@/src/features/agent/calendarIntelligence/types';

export async function buildCreateConflictAlternativesBundle(params: {
  locale: CalendarConflictLocale;
  proposedTitle: string;
  conflict: CalendarScheduleConflict;
  proposedStartMs: number;
  proposedEndMs: number;
  referenceNow: Date;
  preferredRange?: PreferredTimeRange;
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
    const slots = buildConflictAlternativeOptionSlots({
      events: normalized,
      day,
      referenceNow: params.referenceNow,
      durationMinutes,
      excludeStartMs: params.proposedStartMs,
      excludeEndMs: params.proposedEndMs,
      preferredRange: params.preferredRange,
      conflictEndMs: params.conflict.endsAtMs,
    });

    optionLabels = slots.map((slot) =>
      formatConflictSlotLabelWithDay({
        slot,
        referenceNow: params.referenceNow,
        locale: params.locale,
        timeZone,
      }),
    );
    alternativeStartMs = slots
      .map((slot) => parseGoogleCalendarInstant(slot.startISO) ?? 0)
      .filter((value) => value > 0);
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
