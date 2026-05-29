import type { ZonedDayRange } from '@/src/features/agent/calendar/calendarTimezone';

export type NormalizedCalendarEvent = {
  id: string;
  title: string;
  startISO: string;
  endISO: string;
  startMinutes: number;
  endMinutes: number;
  dateKey: string;
  location?: string;
};

export type CalendarFreeSlot = {
  startMinutes: number;
  endMinutes: number;
  durationMinutes: number;
  startISO: string;
  endISO: string;
};

export type CalendarDayContext = {
  dateKey: string;
  dayOffset: number;
  range: ZonedDayRange;
  timezone: string;
};

export type CalendarQueryIntent =
  | 'list_day'
  | 'events_at_time'
  | 'count_at_time'
  | 'next_event'
  | 'last_event'
  | 'free_windows'
  | 'best_slot'
  | 'overlaps'
  | 'combine_activity'
  | null;

export type PreferredTimeRange = {
  startMinutes: number;
  endMinutes: number;
};

export type DeterministicCalendarAnswer = {
  intent: CalendarQueryIntent;
  day: CalendarDayContext;
  events: NormalizedCalendarEvent[];
  payload: Record<string, unknown>;
};
