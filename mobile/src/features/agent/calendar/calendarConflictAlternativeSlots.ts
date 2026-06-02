import { parseGoogleCalendarInstant } from '@/src/features/agent/calendar/calendarTime';
import {
  getZonedTimeParts,
  zonedLocalToUtcMs,
} from '@/src/features/agent/calendar/calendarTimezone';
import { formatDateKey } from '@/src/features/agent/calendarIntelligence/zonedEventTime';
import { extractCalendarClockFragment } from '@/src/features/agent/calendarIntelligence/calendarClockParser';
import { getEventsForDay, getFreeWindows } from '@/src/features/agent/calendarIntelligence/scheduleHelpers';
import type {
  CalendarDayContext,
  CalendarFreeSlot,
  NormalizedCalendarEvent,
  PreferredTimeRange,
} from '@/src/features/agent/calendarIntelligence/types';

/** Human-normal scheduling window (local executive timezone). */
export const CONFLICT_SLOT_DAY_START_MINUTES = 8 * 60;
export const CONFLICT_SLOT_DAY_END_MINUTES = 22 * 60;
const SLOT_STEP_MINUTES = 30;

const PERIOD_MORNING =
  /\b(?:morning|утром|утра|ранку|вранці|рано\s+вранці|зранку)\b/iu;

const PERIOD_AFTERNOON =
  /\b(?:afternoon|днём|днем|дня|час\s+дня|післяобіді|післяобід|після\s+обіду|після\s+полудня)\b/iu;

const PERIOD_EVENING =
  /\b(?:evening|вечером|вечера|вечері|увечері)\b/iu;

export const MORNING_CONFLICT_RANGE: PreferredTimeRange = {
  startMinutes: 8 * 60,
  endMinutes: 12 * 60,
};

export const AFTERNOON_CONFLICT_RANGE: PreferredTimeRange = {
  startMinutes: 12 * 60,
  endMinutes: 18 * 60,
};

export const EVENING_CONFLICT_RANGE: PreferredTimeRange = {
  startMinutes: 18 * 60,
  endMinutes: 22 * 60,
};

function minutesOverlap(startA: number, endA: number, startB: number, endB: number) {
  return startA < endB && endA > startB;
}

function zonedMinutesToIso(day: CalendarDayContext, minutes: number) {
  const anchorYmd = {
    year: Number(day.dateKey.slice(0, 4)),
    month: Number(day.dateKey.slice(5, 7)),
    day: Number(day.dateKey.slice(8, 10)),
    hour: Math.floor(minutes / 60),
    minute: minutes % 60,
    second: 0,
  };

  return new Date(zonedLocalToUtcMs(anchorYmd, day.timezone)).toISOString();
}

function buildFixedSlot(day: CalendarDayContext, startMinutes: number, durationMinutes: number): CalendarFreeSlot {
  const endMinutes = startMinutes + durationMinutes;

  return {
    startMinutes,
    endMinutes,
    durationMinutes,
    startISO: zonedMinutesToIso(day, startMinutes),
    endISO: zonedMinutesToIso(day, endMinutes),
  };
}

function sliceWindowIntoFixedSlots(
  day: CalendarDayContext,
  windowStart: number,
  windowEnd: number,
  durationMinutes: number,
): CalendarFreeSlot[] {
  const boundedStart = Math.max(windowStart, CONFLICT_SLOT_DAY_START_MINUTES);
  const boundedEnd = Math.min(windowEnd, CONFLICT_SLOT_DAY_END_MINUTES);
  const slots: CalendarFreeSlot[] = [];

  for (
    let start = boundedStart;
    start + durationMinutes <= boundedEnd;
    start += SLOT_STEP_MINUTES
  ) {
    slots.push(buildFixedSlot(day, start, durationMinutes));
  }

  return slots;
}

function resolveExcludeMinutesOnDay(
  day: CalendarDayContext,
  excludeStartMs: number,
  excludeEndMs: number,
) {
  const startParts = getZonedTimeParts(new Date(excludeStartMs), day.timezone);
  const endParts = getZonedTimeParts(new Date(excludeEndMs), day.timezone);
  const startDateKey = formatDateKey(startParts);
  const endDateKey = formatDateKey(endParts);

  if (startDateKey !== day.dateKey && endDateKey !== day.dateKey) {
    return null;
  }

  return {
    startMinutes: startParts.hour * 60 + startParts.minute,
    endMinutes: endParts.hour * 60 + endParts.minute,
  };
}

function slotOverlapsEvents(slot: CalendarFreeSlot, events: NormalizedCalendarEvent[]) {
  return events.some((event) =>
    minutesOverlap(slot.startMinutes, slot.endMinutes, event.startMinutes, event.endMinutes),
  );
}

function slotOverlapsExclude(
  slot: CalendarFreeSlot,
  exclude: { startMinutes: number; endMinutes: number } | null,
) {
  if (!exclude) {
    return false;
  }

  return minutesOverlap(
    slot.startMinutes,
    slot.endMinutes,
    exclude.startMinutes,
    exclude.endMinutes,
  );
}

function slotFitsPreferredRange(slot: CalendarFreeSlot, preferredRange?: PreferredTimeRange) {
  if (!preferredRange) {
    return true;
  }

  return (
    slot.startMinutes >= preferredRange.startMinutes &&
    slot.endMinutes <= preferredRange.endMinutes
  );
}

function scoreAlternativeSlot(
  slot: CalendarFreeSlot,
  conflictEndMinutes: number | null,
  preferredRange?: PreferredTimeRange,
) {
  let score = slot.startMinutes;

  if (conflictEndMinutes !== null && slot.startMinutes < conflictEndMinutes) {
    score += 24 * 60;
  }

  if (preferredRange && slotFitsPreferredRange(slot, preferredRange)) {
    score -= 10_000;
  }

  return score;
}

function hydrateSlots(day: CalendarDayContext, slots: CalendarFreeSlot[]) {
  return slots.map((slot) => buildFixedSlot(day, slot.startMinutes, slot.durationMinutes));
}

export function buildConflictAlternativeOptionSlots(params: {
  events: NormalizedCalendarEvent[];
  day: CalendarDayContext;
  referenceNow: Date;
  durationMinutes: number;
  excludeStartMs: number;
  excludeEndMs: number;
  preferredRange?: PreferredTimeRange;
  conflictEndMs?: number;
  maxOptions?: number;
}): CalendarFreeSlot[] {
  const durationMinutes = Math.max(15, Math.round(params.durationMinutes));
  const dayEvents = getEventsForDay(params.events, params.day);
  const rawWindows = getFreeWindows(
    params.events,
    params.day,
    params.referenceNow,
    durationMinutes,
  );

  const exclude = resolveExcludeMinutesOnDay(
    params.day,
    params.excludeStartMs,
    params.excludeEndMs,
  );

  let conflictEndMinutes: number | null = null;

  if (params.conflictEndMs) {
    const parts = getZonedTimeParts(new Date(params.conflictEndMs), params.day.timezone);

    if (formatDateKey(parts) === params.day.dateKey) {
      conflictEndMinutes = parts.hour * 60 + parts.minute;
    }
  }

  const candidates: CalendarFreeSlot[] = [];

  for (const window of rawWindows) {
    const windowStart = Math.max(window.startMinutes, CONFLICT_SLOT_DAY_START_MINUTES);
    const windowEnd = Math.min(window.endMinutes, CONFLICT_SLOT_DAY_END_MINUTES);

    if (windowEnd - windowStart < durationMinutes) {
      continue;
    }

    const sliced = sliceWindowIntoFixedSlots(params.day, windowStart, windowEnd, durationMinutes);

    for (const slot of sliced) {
      if (slotOverlapsEvents(slot, dayEvents)) {
        continue;
      }

      if (slotOverlapsExclude(slot, exclude)) {
        continue;
      }

      if (params.preferredRange && !slotFitsPreferredRange(slot, params.preferredRange)) {
        continue;
      }

      candidates.push(slot);
    }
  }

  const uniqueByStart = new Map<number, CalendarFreeSlot>();

  for (const slot of candidates) {
    if (!uniqueByStart.has(slot.startMinutes)) {
      uniqueByStart.set(slot.startMinutes, slot);
    }
  }

  const ranked = [...uniqueByStart.values()].sort(
    (left, right) =>
      scoreAlternativeSlot(left, conflictEndMinutes, params.preferredRange) -
      scoreAlternativeSlot(right, conflictEndMinutes, params.preferredRange),
  );

  return hydrateSlots(params.day, ranked).slice(0, params.maxOptions ?? 3);
}

export function detectVagueConflictTimePeriod(
  transcript: string,
): PreferredTimeRange | 'needs_clarification' | null {
  const normalized = transcript.trim();

  if (!normalized) {
    return null;
  }

  const hasExplicitClock = /\b\d{1,2}(?::\d{2})?\b/u.test(normalized);
  const hasMorning = PERIOD_MORNING.test(normalized);
  const hasAfternoon =
    PERIOD_AFTERNOON.test(normalized) || /(?:час\s+дня)/iu.test(normalized);
  const hasEvening = PERIOD_EVENING.test(normalized);

  if (!hasExplicitClock) {
    if (hasMorning && !hasAfternoon && !hasEvening) {
      return MORNING_CONFLICT_RANGE;
    }

    if (hasEvening && !hasMorning && !hasAfternoon) {
      return EVENING_CONFLICT_RANGE;
    }

    if (hasAfternoon) {
      return AFTERNOON_CONFLICT_RANGE;
    }
  }

  if (hasExplicitClock && extractCalendarClockFragment(normalized)) {
    return null;
  }

  if (/^(?:завтра|сьогодні|сегодня|tomorrow|today)$/iu.test(normalized)) {
    return 'needs_clarification';
  }

  if (
    /(?:завтра|tomorrow|сьогодні|сегодня|today)/iu.test(normalized) &&
    !hasMorning &&
    !hasAfternoon &&
    !hasEvening
  ) {
    return 'needs_clarification';
  }

  return null;
}

export function slotDurationMatchesRequest(slot: CalendarFreeSlot, durationMinutes: number) {
  return slot.durationMinutes === Math.max(15, Math.round(durationMinutes));
}

export function slotRangeLooksLikeHugeWindow(slot: CalendarFreeSlot) {
  return slot.durationMinutes > 180;
}
