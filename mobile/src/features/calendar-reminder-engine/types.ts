import type { CalendarEvent } from '@/src/entities/calendar/types';

export type CalendarReminderCandidate = {
  event: CalendarEvent;
  minutesUntilStart: number;
  dedupeKey: string;
};

export type ActiveCalendarReminderNotification = {
  id: string;
  eventTitle: string;
  message: string;
  startsAt: string;
  triggeredAt: string;
};
