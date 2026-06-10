import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CalendarEvent } from '@/src/entities/calendar/types';
import {
  NO_CALENDAR_EVENTS_TODAY_MESSAGE,
  resolveVisibleCalendarAgenda,
} from '@/src/features/home/utils/homeCalendarAgenda';

function event(id: string, title: string, startsAt: string): CalendarEvent {
  return {
    id,
    title,
    startsAt,
    endsAt: startsAt,
    isAllDay: false,
    attendees: [],
  };
}

describe('resolveVisibleCalendarAgenda', () => {
  it('returns empty agenda when calendar is not connected', () => {
    const result = resolveVisibleCalendarAgenda({
      isCalendarConnected: false,
      upcomingEvents: [event('demo-1', 'Board prep', '2026-05-28T09:00:00.000Z')],
    });

    assert.equal(result.source, 'disconnected');
    assert.equal(result.visibleCalendarAgendaItems.length, 0);
  });

  it('maps only fetched Google Calendar events when connected', () => {
    const result = resolveVisibleCalendarAgenda({
      isCalendarConnected: true,
      upcomingEvents: [event('google-1', 'Investor sync', '2026-05-28T11:30:00.000Z')],
      referenceDate: new Date('2026-05-28T08:00:00.000Z'),
    });

    assert.equal(result.source, 'google_calendar');
    assert.equal(result.visibleCalendarAgendaItems.length, 1);
    assert.equal(result.visibleCalendarAgendaItems[0]?.title, 'Investor sync');
  });

  it('returns empty agenda when connected but there are no events', () => {
    const result = resolveVisibleCalendarAgenda({
      isCalendarConnected: true,
      upcomingEvents: [],
    });

    assert.equal(result.source, 'google_calendar');
    assert.equal(result.visibleCalendarAgendaItems.length, 0);
    assert.equal(NO_CALENDAR_EVENTS_TODAY_MESSAGE, 'No calendar events for today');
  });
});
