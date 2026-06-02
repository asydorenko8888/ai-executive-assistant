import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import type { CalendarEvent } from '@/src/entities/calendar/types';
import {
  augmentEventsWithConversationContext,
  getConversationEventMemory,
  recordCreatedConversationEvent,
  recordModifiedConversationEvent,
  resetConversationEventMemory,
} from '@/src/features/agent/calendar/calendarConversationEventMemory';
import { resetCalendarConversationState } from '@/src/features/agent/calendar/calendarConversationState';
import { setLastCalendarSnapshot } from '@/src/features/agent/calendar/calendarConversationStore';
import { getCalendarWorkingMemory } from '@/src/features/agent/calendar/calendarConversationStore';
import { resolveCalendarUpdateIntent } from '@/src/features/agent/calendar/calendarUpdateEventResolution';
import { selectBestEventByTitlePriority } from '@/src/features/agent/calendar/calendarTitleMatchPriority';
import { shouldClearStalePendingForNewCommand } from '@/src/features/agent/calendar/calendarNewCommandPendingClear';
import { buildCalendarPendingAction } from '@/src/features/agent/calendar/calendarConversationState';

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

describe('calendar conversation memory flow', () => {
  beforeEach(() => {
    resetCalendarConversationState('test_reset');
    resetConversationEventMemory('test_reset');
  });

  it('keeps Dinner in memory after Dentist is modified', () => {
    recordCreatedConversationEvent({
      eventId: 'dinner',
      title: 'Dinner',
      startISO: '2026-05-28T19:00:00-05:00',
      endISO: '2026-05-28T20:00:00-05:00',
    });

    recordModifiedConversationEvent({
      eventId: 'dentist',
      title: 'Dentist',
      startISO: '2026-05-28T19:00:00-05:00',
      endISO: '2026-05-28T20:00:00-05:00',
    });

    const mem = getConversationEventMemory();

    assert.equal(mem.lastCreatedEvent?.title, 'Dinner');
    assert.equal(mem.lastModifiedEvent?.title, 'Dentist');
    assert.equal(mem.lastReferencedEvent?.title, 'Dentist');
  });

  it('resolves Move Dinner 2 hours later from snapshot + memory', () => {
    recordCreatedConversationEvent({
      eventId: 'dinner',
      title: 'Dinner',
      startISO: '2026-05-28T19:00:00-05:00',
      endISO: '2026-05-28T20:00:00-05:00',
    });

    setLastCalendarSnapshot(
      [
        event({
          id: 'dinner',
          title: 'Dinner',
          startsAt: '2026-05-28T19:00:00-05:00',
          endsAt: '2026-05-28T20:00:00-05:00',
        }),
        event({
          id: 'dentist',
          title: 'Dentist',
          startsAt: '2026-05-28T19:00:00-05:00',
          endsAt: '2026-05-28T20:00:00-05:00',
        }),
      ],
      'test',
    );

    const fetched: CalendarEvent[] = [];
    const augmented = augmentEventsWithConversationContext(fetched);
    const resolved = resolveCalendarUpdateIntent({
      transcript: 'Move Dinner 2 hours later',
      referenceNow,
      events: augmented,
      timeZone,
    });

    assert.equal(resolved.ok, true);

    if (resolved.ok) {
      assert.equal(resolved.target.id, 'dinner');
      assert.equal(resolved.requestedStartMs, Date.parse('2026-05-28T21:00:00-05:00'));
    }
  });

  it('does not mark a single Dinner match as ambiguous', () => {
    const events = [
      event({
        id: 'dinner',
        title: 'Dinner',
        startsAt: '2026-05-28T19:00:00-05:00',
        endsAt: '2026-05-28T20:00:00-05:00',
      }),
    ];

    const selection = selectBestEventByTitlePriority(events, 'Dinner');

    assert.equal(selection.ambiguous, false);
    assert.equal(selection.match?.id, 'dinner');
  });

  it('clears stale event selection when user names Dinner explicitly', () => {
    const pending = buildCalendarPendingAction({
      actionType: 'update',
      originalIntent: 'Move Dentist to 7 PM',
      eventTitle: 'Dentist',
      sourceTranscript: 'Move Dentist to 7 PM',
      languageCode: 'en-US',
      proposedStartMs: Date.parse('2026-05-28T19:00:00-05:00'),
      proposedEndMs: Date.parse('2026-05-28T20:00:00-05:00'),
    });

    assert.equal(
      shouldClearStalePendingForNewCommand('Move Dinner 2 hours later', pending),
      true,
    );
  });

  it('stores flat id/name fields in working memory', () => {
    recordCreatedConversationEvent({
      eventId: 'dinner',
      title: 'Dinner',
      startISO: '2026-05-28T19:00:00-05:00',
      endISO: '2026-05-28T20:00:00-05:00',
    });

    const store = getCalendarWorkingMemory();

    assert.equal(store.lastCreatedEventId, 'dinner');
    assert.equal(store.lastCreatedEventName, 'Dinner');
  });
});
