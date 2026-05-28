export type CalendarProvider = 'google' | 'outlook' | 'apple';

export type CalendarTimePressure = 'light' | 'moderate' | 'heavy';

export type CalendarConnectionStatus = 'connected' | 'not_connected' | 'expired' | 'missing_config';

export type CalendarFreeWindow = {
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
};

export type CalendarConnection = {
  provider: CalendarProvider;
  status: CalendarConnectionStatus;
  connectedEmail?: string;
  connectedAt?: string;
  expiresAt?: string;
};

export type CalendarEvent = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location?: string;
  isAllDay: boolean;
  isCancelled?: boolean;
  attendees?: string[];
};

export type CalendarSummary = {
  date: string;
  eventsCount: number;
  focusBlocksCount: number;
  nextEvent?: CalendarEvent;
  followingEvent?: CalendarEvent;
  nextFreeWindow?: CalendarFreeWindow;
  freeWindows: CalendarFreeWindow[];
  busyMinutes: number;
  freeMinutes: number;
  timePressure: CalendarTimePressure;
  hasBackToBackMeetings: boolean;
  transitionSummary: string;
  availabilitySummary: string;
  connectedEmail?: string;
};
