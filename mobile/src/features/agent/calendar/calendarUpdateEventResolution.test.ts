import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CalendarEvent } from '@/src/entities/calendar/types';
import { resolveCalendarUpdateIntent } from '@/src/features/agent/calendar/calendarUpdateEventResolution';

const referenceNow = new Date('2026-05-28T12:00:00-05:00');
const timeZone = 'America/Chicago';

function event(params: {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
}): CalendarEvent {
  return {
    id: params.id,
    title: params.title,
    startsAt: params.startsAt,
    endsAt: params.endsAt,
    isAllDay: false,
  };
}

describe('calendar update event resolution (first principles)', () => {
  it('resolves Dentist by name when Dinner occupies 8 PM', () => {
    const events = [
      event({
        id: 'dentist',
        title: 'Dentist',
        startsAt: '2026-05-28T19:00:00-05:00',
        endsAt: '2026-05-28T20:00:00-05:00',
      }),
      event({
        id: 'dinner',
        title: 'Dinner',
        startsAt: '2026-05-28T20:00:00-05:00',
        endsAt: '2026-05-28T21:00:00-05:00',
      }),
    ];

    const resolved = resolveCalendarUpdateIntent({
      transcript: 'Move Dentist to 8 PM',
      referenceNow,
      events,
      timeZone,
    });

    assert.equal(resolved.ok, true);

    if (resolved.ok) {
      assert.equal(resolved.target.id, 'dentist');
      assert.equal(resolved.requestedEventName, 'Dentist');
      assert.equal(resolved.requestedStartMs, Date.parse('2026-05-28T20:00:00-05:00'));
      assert.notEqual(resolved.target.id, 'dinner');
    }
  });

  it('never picks Dinner as target for Move Dentist to 8 PM', () => {
    const events = [
      event({
        id: 'dentist',
        title: 'Dentist',
        startsAt: '2026-05-28T19:00:00-05:00',
        endsAt: '2026-05-28T20:00:00-05:00',
      }),
      event({
        id: 'dinner',
        title: 'Dinner',
        startsAt: '2026-05-28T20:00:00-05:00',
        endsAt: '2026-05-28T21:00:00-05:00',
      }),
    ];

    const resolved = resolveCalendarUpdateIntent({
      transcript: 'Move Dentist to 8 PM',
      referenceNow,
      events,
      timeZone,
    });

    assert.equal(resolved.ok, true);

    if (resolved.ok) {
      assert.equal(resolved.target.title, 'Dentist');
    }
  });

  it('reports no_time_change when destination equals current start', () => {
    const resolved = resolveCalendarUpdateIntent({
      transcript: 'Move Dentist to 7 PM',
      referenceNow,
      events: [
        event({
          id: 'dentist',
          title: 'Dentist',
          startsAt: '2026-05-28T19:00:00-05:00',
          endsAt: '2026-05-28T20:00:00-05:00',
        }),
      ],
      timeZone,
    });

    assert.equal(resolved.ok, false);

    if (!resolved.ok) {
      assert.equal(resolved.reason, 'no_time_change');
      assert.equal(resolved.target?.id, 'dentist');
    }
  });

  it('parses destination time before any clock-based event substitution', () => {
    const resolved = resolveCalendarUpdateIntent({
      transcript: 'Move Meditation to 11:30 PM',
      referenceNow: new Date('2026-05-28T18:00:00-05:00'),
      events: [
        event({
          id: 'meditation',
          title: 'Meditation',
          startsAt: '2026-05-28T23:00:00-05:00',
          endsAt: '2026-05-29T00:00:00-05:00',
        }),
        event({
          id: 'walk',
          title: 'Walk',
          startsAt: '2026-05-28T22:00:00-05:00',
          endsAt: '2026-05-28T23:00:00-05:00',
        }),
      ],
      timeZone,
    });

    assert.equal(resolved.ok, true);

    if (resolved.ok) {
      assert.equal(resolved.target.id, 'meditation');
      assert.equal(resolved.requestedStartMs, Date.parse('2026-05-28T23:30:00-05:00'));
    }
  });
});
