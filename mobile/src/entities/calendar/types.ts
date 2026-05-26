export type CalendarProvider = 'google' | 'outlook' | 'apple';

export type CalendarEvent = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location?: string;
  isAllDay: boolean;
};

export type CalendarSummary = {
  date: string;
  eventsCount: number;
  focusBlocksCount: number;
  nextEvent?: CalendarEvent;
};
