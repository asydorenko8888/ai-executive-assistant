import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CalendarEvent } from '@/src/entities/calendar/types';
import {
  commitCreatedCalendarEvent,
  resetCalendarConversationStore,
} from '@/src/features/agent/calendar/calendarConversationStore';
import { augmentEventsWithConversationContext } from '@/src/features/agent/calendar/calendarConversationEventMemory';
import { resetConversationEventMemory } from '@/src/features/agent/calendar/calendarConversationEventMemory';
import { resetCalendarConversationState } from '@/src/features/agent/calendar/calendarConversationState';
import {
  markCalendarMutationRefreshRequired,
  resetCalendarMutationRefreshRequirement,
} from '@/src/features/agent/calendar/calendarPreMutationRefreshState';
import { resolveCalendarUpdateIntent } from '@/src/features/agent/calendar/calendarUpdateEventResolution';

const timeZone = 'America/Chicago';
const referenceNow = new Date('2026-05-28T18:00:00-05:00');

function resetState() {
  resetConversationEventMemory('test_reset');
  resetCalendarConversationStore('test_reset');
  resetCalendarConversationState('test_reset');
  resetCalendarMutationRefreshRequirement('test_reset');
}

describe('calendar pre-mutation refresh', () => {
  it('finds a newly created event from local store when remote fetch is empty', () => {
    resetState();
    markCalendarMutationRefreshRequired('test_create');

    commitCreatedCalendarEvent({
      eventId: 'sapper-1800',
      title: 'Сапер',
      startISO: '2026-05-28T18:00:00-05:00',
      endISO: '2026-05-28T19:00:00-05:00',
    });

    const searchPool = augmentEventsWithConversationContext([]);
    const resolved = resolveCalendarUpdateIntent({
      transcript: 'Перенеси сапер на 2 часа позже',
      referenceNow,
      events: searchPool,
      timeZone,
    });

    assert.equal(resolved.ok, true);

    if (!resolved.ok) {
      return;
    }

    assert.equal(resolved.target.id, 'sapper-1800');
    assert.equal(resolved.target.title, 'Сапер');
    assert.equal(resolved.requestedStartMs, Date.parse('2026-05-28T20:00:00-05:00'));
  });

  it('preserves created event in search pool when remote list omits it', () => {
    resetState();

    commitCreatedCalendarEvent({
      eventId: 'sapper-1800',
      title: 'Сапер',
      startISO: '2026-05-28T18:00:00-05:00',
      endISO: '2026-05-28T19:00:00-05:00',
    });

    const unrelated: CalendarEvent = {
      id: 'walk-1100',
      title: 'Прогулка',
      startsAt: '2026-05-28T11:00:00-05:00',
      endsAt: '2026-05-28T12:00:00-05:00',
      isAllDay: false,
    };

    const searchPool = augmentEventsWithConversationContext([unrelated]);
    assert.ok(searchPool.some((event) => event.id === 'sapper-1800'));

    const resolved = resolveCalendarUpdateIntent({
      transcript: 'Перенеси сапер на 2 часа позже',
      referenceNow,
      events: searchPool,
      timeZone,
    });

    assert.equal(resolved.ok, true);
  });
});
