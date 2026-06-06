import type { CalendarEvent } from '@/src/entities/calendar/types';
import { getMinutesUntilEvent } from '@/src/features/agent/calendar/calendarTime';
import {
  filterUpcomingTimedEvents,
  isCancelledCalendarEvent,
  isTimedCalendarEvent,
} from '@/src/features/agent/calendar/calendarSchedule';
import { CALENDAR_REMINDER_OFFSET_MINUTES } from '@/src/features/calendar-reminder-engine/constants';
import { buildCalendarReminderDedupeKey } from '@/src/features/calendar-reminder-engine/calendarReminderDedupStorage';
import type { CalendarReminderCandidate } from '@/src/features/calendar-reminder-engine/types';

export function isCalendarReminderDue(
  minutesUntilStart: number,
  offsetMinutes = CALENDAR_REMINDER_OFFSET_MINUTES,
) {
  return minutesUntilStart === offsetMinutes;
}

export function findCalendarRemindersDue(params: {
  events: CalendarEvent[];
  referenceNow: Date;
  announcedKeys: Set<string>;
  offsetMinutes?: number;
}): CalendarReminderCandidate[] {
  const offsetMinutes = params.offsetMinutes ?? CALENDAR_REMINDER_OFFSET_MINUTES;
  const due: CalendarReminderCandidate[] = [];

  for (const event of filterUpcomingTimedEvents(params.events, params.referenceNow)) {
    if (!isTimedCalendarEvent(event) || isCancelledCalendarEvent(event)) {
      continue;
    }

    const minutesUntilStart = getMinutesUntilEvent(event.startsAt, params.referenceNow);

    if (minutesUntilStart === null || !isCalendarReminderDue(minutesUntilStart, offsetMinutes)) {
      continue;
    }

    const dedupeKey = buildCalendarReminderDedupeKey(event.id, event.startsAt, offsetMinutes);

    if (params.announcedKeys.has(dedupeKey)) {
      continue;
    }

    due.push({
      event,
      minutesUntilStart,
      dedupeKey,
    });
  }

  return due;
}
