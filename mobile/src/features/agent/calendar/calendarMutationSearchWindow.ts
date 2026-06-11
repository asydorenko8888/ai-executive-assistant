import type { ConversationEventRecord } from '@/src/features/agent/calendar/calendarConversationEventMemory';
import { resolveMutationSearchDayOffset } from '@/src/features/agent/calendar/calendarActiveEventContext';
import { detectCalendarCommandIntent } from '@/src/features/agent/calendar/calendarCommandTypes';
import {
  parseCalendarUpdateSchedule,
  type CalendarUpdateSchedule,
} from '@/src/features/agent/calendar/calendarUpdateScheduleParser';
import {
  getExecutiveCalendarTimezone,
  resolveZonedDayOffsetForInstant,
} from '@/src/features/agent/calendar/calendarTimezone';
import { parseNaturalDayOffset } from '@/src/features/agent/calendarIntelligence/calendarNaturalDateParser';

/** Reschedule moves name a destination day; the source event may still live on today. */
function scheduleNeedsSourceEventSearch(
  schedule: CalendarUpdateSchedule,
  transcript: string,
): boolean {
  if (!schedule.ok) {
    return false;
  }

  if (detectCalendarCommandIntent(transcript) === 'delete_calendar_event') {
    return false;
  }

  switch (schedule.kind) {
    case 'relative_offset':
    case 'day_preserve_time':
    case 'event_day_shift':
      return true;
    case 'destination':
    case 'day_period':
      return schedule.hasExplicitDay;
    default:
      return false;
  }
}

export function resolveMutationSearchDayOffsets(params: {
  transcript: string;
  referenceNow: Date;
  memoryRef?: ConversationEventRecord | null;
  timeZone?: string;
}): number[] {
  const timeZone = params.timeZone ?? getExecutiveCalendarTimezone();
  const memoryRef = params.memoryRef ?? null;
  const schedule = parseCalendarUpdateSchedule(params.transcript, params.referenceNow, timeZone);
  const searchDayOffset = resolveMutationSearchDayOffset({
    transcript: params.transcript,
    referenceNow: params.referenceNow,
    memoryRef,
    schedule,
    timeZone,
  });
  const namedDay =
    parseNaturalDayOffset(params.transcript, params.referenceNow, timeZone) !== null;

  if (namedDay && !scheduleNeedsSourceEventSearch(schedule, params.transcript)) {
    return [searchDayOffset];
  }

  const offsets = new Set<number>([0, 1]);

  if (searchDayOffset >= 0) {
    offsets.add(searchDayOffset);
  }

  if (memoryRef?.startISO) {
    const memoryDay = resolveZonedDayOffsetForInstant(
      memoryRef.startISO,
      params.referenceNow,
      timeZone,
    );

    if (memoryDay !== null) {
      offsets.add(memoryDay);
    }
  }

  return [...offsets].sort((left, right) => left - right);
}
