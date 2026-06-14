import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import type { CalendarEvent } from '@/src/entities/calendar/types';
import {
  getLastReferencedCalendarEvent,
  recordModifiedConversationEvent,
  resetConversationEventMemory,
  shouldDeleteFromLastReferencedMemory,
} from '@/src/features/agent/calendar/calendarConversationEventMemory';
import { resetCalendarConversationState } from '@/src/features/agent/calendar/calendarConversationState';
import { resolveCalendarDeleteTargetFromEvents } from '@/src/features/agent/calendar/calendarDeleteResolution';
import { findCalendarEventForDeleteFromEvents } from '@/src/features/agent/calendarIntelligence/eventAtTimeMatch';
import {
  clearPendingIntent,
  setPendingIntentForClarification,
} from '@/src/features/agent/calendar/calendarPendingIntent';

const referenceNow = new Date('2026-05-28T14:00:00-05:00');

function massageAt15(): CalendarEvent {
  return {
    id: 'massage-moved',
    title: 'Massage',
    startsAt: '2026-05-28T15:00:00-05:00',
    endsAt: '2026-05-28T16:00:00-05:00',
    isAllDay: false,
  };
}

describe('pronoun delete after move', () => {
  beforeEach(() => {
    resetConversationEventMemory('test_reset');
    resetCalendarConversationState('test_reset');
    clearPendingIntent('test_reset');
  });

  it('resolves Delete it to moved Massage at 15:00 without calendar search', () => {
    recordModifiedConversationEvent({
      eventId: 'massage-moved',
      title: 'Massage',
      startISO: '2026-05-28T15:00:00-05:00',
      endISO: '2026-05-28T16:00:00-05:00',
    });

    setPendingIntentForClarification({
      intent: 'MOVE_EVENT',
      title: 'Massage',
      startISO: '2026-05-28T16:00:00-05:00',
      endISO: '2026-05-28T17:00:00-05:00',
      eventId: 'massage-moved',
      sourceTranscript: 'Move Massage to 3 PM',
    });

    assert.equal(shouldDeleteFromLastReferencedMemory({ transcript: 'Delete it', referenceNow }), true);

    const lastReferenced = getLastReferencedCalendarEvent(referenceNow);
    assert.equal(lastReferenced?.eventId, 'massage-moved');
    assert.equal(lastReferenced?.startTime, '2026-05-28T15:00:00-05:00');

    const resolution = resolveCalendarDeleteTargetFromEvents({
      events: [massageAt15()],
      titleQuery: 'Massage',
      transcript: 'Delete it',
      referenceNow,
    });

    assert.equal(resolution.status, 'unique');
    if (resolution.status === 'unique') {
      assert.equal(resolution.event.id, 'massage-moved');
      assert.equal(resolution.event.startsAt, '2026-05-28T15:00:00-05:00');
    }
  });

  it('does not let stale MOVE_EVENT pending intent shadow lastReferenced for pronoun delete', () => {
    recordModifiedConversationEvent({
      eventId: 'massage-moved',
      title: 'Massage',
      startISO: '2026-05-28T15:00:00-05:00',
      endISO: '2026-05-28T16:00:00-05:00',
    });

    setPendingIntentForClarification({
      intent: 'MOVE_EVENT',
      title: 'Massage',
      startISO: '2026-05-28T16:00:00-05:00',
      endISO: '2026-05-28T17:00:00-05:00',
      eventId: 'massage-moved',
      sourceTranscript: 'Move Massage one hour earlier',
    });

    const deleted = findCalendarEventForDeleteFromEvents({
      transcript: 'Delete it',
      referenceNow,
      events: [],
      titleQuery: '',
    });

    assert.equal(deleted.match?.id, 'massage-moved');
    assert.equal(deleted.match?.startsAt, '2026-05-28T15:00:00-05:00');
    assert.equal(deleted.matchSource, 'conversation_memory');
  });
});
