import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CalendarEvent } from '@/src/entities/calendar/types';
import { resolveBriefingCalendarEvents } from '@/src/features/agent/calendar/briefingCalendarEvents';
import type { ExecutiveAgentSnapshot } from '@/src/features/agent/types';

function event(id: string, title: string, startsAt: string, endsAt: string): CalendarEvent {
  return {
    id,
    title,
    startsAt,
    endsAt,
    isAllDay: false,
    attendees: [],
  };
}

function connectedSnapshot(events: CalendarEvent[]): ExecutiveAgentSnapshot {
  return {
    calendarConnection: {
      provider: 'google',
      status: 'connected',
      connectedEmail: 'user@example.com',
    },
    calendarSummary: undefined,
    upcomingCalendarEvents: events,
    emailDigest: undefined,
    tasks: [],
    reminders: [],
    routeAwareness: undefined,
    notifications: [],
    capabilities: {
      calendar: 'available',
      email: 'not_connected',
      tasks: 'available',
      reminders: 'available',
      route: 'coming_soon',
      briefings: 'available',
    },
  };
}

describe('resolveBriefingCalendarEvents', () => {
  it('returns disconnected source when calendar is not connected', () => {
    const result = resolveBriefingCalendarEvents({
      snapshot: {
        ...connectedSnapshot([]),
        calendarConnection: { provider: 'google', status: 'not_connected' },
      },
      referenceNow: new Date('2026-05-28T08:00:00.000Z'),
    });

    assert.equal(result.source, 'disconnected');
    assert.deepEqual(result.events, []);
  });

  it('uses only fetched google events for today and ignores stale local titles', () => {
    const result = resolveBriefingCalendarEvents({
      snapshot: connectedSnapshot([
        event('google-1', 'Team dinner', '2026-05-28T18:30:00.000Z', '2026-05-28T19:30:00.000Z'),
        event('stale-local', 'Массаж', '2026-05-29T16:00:00.000Z', '2026-05-29T17:00:00.000Z'),
      ]),
      referenceNow: new Date('2026-05-28T08:00:00.000Z'),
    });

    assert.equal(result.source, 'google_calendar');
    assert.equal(result.events.length, 1);
    assert.equal(result.events[0]?.title, 'Team dinner');
  });
});
