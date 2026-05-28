import type {
  CalendarFreeWindow,
  CalendarSummary,
  CalendarTimePressure,
} from '@/src/entities/calendar/types';

import { formatLocationShort } from '@/src/features/agent/calendar/calendarLocation';
import { formatTimeInLocalTimezone } from '@/src/features/agent/calendar/calendarTime';

type DayPart = 'morning' | 'afternoon' | 'evening';

function getDayPart(referenceDate: Date): DayPart {
  const hour = referenceDate.getHours();

  if (hour < 12) {
    return 'morning';
  }

  if (hour < 17) {
    return 'afternoon';
  }

  return 'evening';
}

function describeOpenDayPart(dayPart: DayPart) {
  if (dayPart === 'morning') {
    return 'The rest of your morning is fairly open.';
  }

  if (dayPart === 'afternoon') {
    return 'The rest of the afternoon is fairly open.';
  }

  return 'Your evening still has room.';
}

export function describeNextFreeWindowNaturally(
  freeWindow: CalendarFreeWindow,
  referenceDate = new Date(),
) {
  const windowStart = new Date(freeWindow.startsAt);
  const dayPart = Number.isNaN(windowStart.getTime()) ? getDayPart(referenceDate) : getDayPart(windowStart);
  const durationMinutes = freeWindow.durationMinutes;

  if (durationMinutes >= 120) {
    return describeOpenDayPart(dayPart);
  }

  if (durationMinutes >= 45) {
    return 'You have some free time before the next event.';
  }

  if (durationMinutes >= 20) {
    return 'There is a short open window ahead.';
  }

  return 'The next block starts soon.';
}

export function describeDayAvailabilityNaturally(params: {
  freeMinutes: number;
  busyMinutes: number;
  eventsCount: number;
  timePressure: CalendarTimePressure;
  dayDurationMinutes: number;
}) {
  const freeRatio = params.dayDurationMinutes > 0 ? params.freeMinutes / params.dayDurationMinutes : 0;

  if (params.timePressure === 'light' || (params.eventsCount <= 2 && freeRatio >= 0.55)) {
    return 'Today is fairly light.';
  }

  if (params.timePressure === 'heavy') {
    return 'The calendar is fairly full today.';
  }

  if (freeRatio >= 0.45) {
    return 'There is still some flexibility today.';
  }

  return 'The day is fairly structured.';
}

export function describeTimePressureNaturally(timePressure: CalendarTimePressure) {
  switch (timePressure) {
    case 'light':
      return 'Today is fairly light.';
    case 'moderate':
      return 'You have a steady day ahead.';
    case 'heavy':
      return 'The calendar is fairly full today.';
    default:
      return 'There is still some room in the day.';
  }
}

function formatNextMeetingLead(params: {
  nextEvent: NonNullable<CalendarSummary['nextEvent']>;
  timeLabel: string;
}) {
  const shortLocation = params.nextEvent.location
    ? formatLocationShort(params.nextEvent.location)
    : '';
  const locationSuffix = shortLocation ? ` in ${shortLocation}` : '';

  return `Your next meeting is at ${params.timeLabel}${locationSuffix}.`;
}

function formatFollowingMeetingLine(followingEvent: CalendarSummary['followingEvent']) {
  if (!followingEvent) {
    return '';
  }

  const followTimeLabel = formatTimeInLocalTimezone(followingEvent.startsAt);
  const title = followingEvent.title.trim();

  if (title) {
    return ` Then ${title} at ${followTimeLabel}.`;
  }

  return ` Then another meeting at ${followTimeLabel}.`;
}

function describeNextMeeting(params: {
  nextEvent: NonNullable<CalendarSummary['nextEvent']>;
  followingEvent?: CalendarSummary['followingEvent'];
  minutesUntilNextEvent?: number | null;
  hasBackToBackMeetings: boolean;
}) {
  const timeLabel = formatTimeInLocalTimezone(params.nextEvent.startsAt);
  const minutesUntil = params.minutesUntilNextEvent;
  const lead = formatNextMeetingLead({ nextEvent: params.nextEvent, timeLabel });
  const followUp = formatFollowingMeetingLine(params.followingEvent);

  if (followUp) {
    return `${lead}${followUp}`;
  }

  if (minutesUntil !== null && minutesUntil !== undefined && minutesUntil > 15 && minutesUntil <= 60) {
    return `${lead} You have a little time before it.`;
  }

  if (params.hasBackToBackMeetings) {
    return `${lead} The day stays fairly tight after that.`;
  }

  return lead;
}

export function buildCalendarTransitionSummary(params: {
  nextEvent?: CalendarSummary['nextEvent'];
  followingEvent?: CalendarSummary['followingEvent'];
  nextFreeWindow?: CalendarFreeWindow;
  hasBackToBackMeetings: boolean;
  timePressure: CalendarTimePressure;
  freeMinutes: number;
  busyMinutes: number;
  eventsCount: number;
  dayDurationMinutes: number;
  minutesUntilNextEvent?: number | null;
  referenceDate?: Date;
}) {
  const referenceDate = params.referenceDate ?? new Date();

  if (params.nextEvent) {
    return describeNextMeeting({
      nextEvent: params.nextEvent,
      followingEvent: params.followingEvent,
      minutesUntilNextEvent: params.minutesUntilNextEvent,
      hasBackToBackMeetings: params.hasBackToBackMeetings,
    });
  }

  if (params.nextFreeWindow) {
    return describeNextFreeWindowNaturally(params.nextFreeWindow, referenceDate);
  }

  return describeDayAvailabilityNaturally({
    freeMinutes: params.freeMinutes,
    busyMinutes: params.busyMinutes,
    eventsCount: params.eventsCount,
    timePressure: params.timePressure,
    dayDurationMinutes: params.dayDurationMinutes,
  });
}

export function buildCalendarAvailabilitySummary(
  summary: CalendarSummary,
  referenceDate = new Date(),
  minutesUntilNextEvent?: number | null,
) {
  if (summary.nextFreeWindow) {
    return describeNextFreeWindowNaturally(summary.nextFreeWindow, referenceDate);
  }

  return describeDayAvailabilityNaturally({
    freeMinutes: summary.freeMinutes,
    busyMinutes: summary.busyMinutes,
    eventsCount: summary.eventsCount,
    timePressure: summary.timePressure,
    dayDurationMinutes: Math.max(summary.freeMinutes + summary.busyMinutes, 1),
  });
}

export function areCalendarPhrasesEquivalent(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}
