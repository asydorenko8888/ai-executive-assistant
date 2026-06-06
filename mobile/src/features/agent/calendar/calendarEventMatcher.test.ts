import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CalendarEvent } from '@/src/entities/calendar/types';
import { resolveCalendarUpdateIntent } from '@/src/features/agent/calendar/calendarUpdateEventResolution';
import {
  deduplicateCalendarEvents,
} from '@/src/features/agent/calendar/calendarEventDeduplication';
import {
  augmentEventsWithConversationContext,
} from '@/src/features/agent/calendar/calendarConversationEventMemory';

const timeZone = 'America/Chicago';
const referenceNow = new Date('2026-05-28T18:19:00-05:00');

describe('calendarEventMatcher update resolution', () => {
  it('resolves Перенеси прогулку на 2 часа позже against deduplicated fetched events', () => {
    const walk: CalendarEvent = {
      id: 'walk-1100',
      title: 'Прогулка',
      startsAt: '2026-05-28T11:00:00-05:00',
      endsAt: '2026-05-28T12:00:00-05:00',
      isAllDay: false,
    };

    const augmented = augmentEventsWithConversationContext([walk]);
    const dedupedEvents = deduplicateCalendarEvents(augmented);
    const resolved = resolveCalendarUpdateIntent({
      transcript: 'Перенеси прогулку на 2 часа позже',
      referenceNow,
      events: dedupedEvents,
      timeZone,
    });

    assert.equal(resolved.ok, true);

    if (!resolved.ok) {
      return;
    }

    assert.equal(resolved.target.id, 'walk-1100');
    assert.equal(resolved.requestedStartMs, Date.parse('2026-05-28T13:00:00-05:00'));
  });
});
