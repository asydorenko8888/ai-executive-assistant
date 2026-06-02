import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import {
  advanceCalendarConversationTurn,
  CONVERSATION_CONTEXT_MAX_TURNS,
  isCalendarConversationContextFresh,
  touchCalendarConversationContext,
} from '@/src/features/agent/calendar/calendarConversationContext';
import {
  recordCreatedConversationEvent,
  resetConversationEventMemory,
  resolveMoveEventReference,
} from '@/src/features/agent/calendar/calendarConversationEventMemory';
import { extractCalendarUpdateParameters } from '@/src/features/agent/calendar/calendarUpdateIntentExtractor';
import {
  clearPendingIntent,
  getPendingIntent,
  setPendingIntentForClarification,
} from '@/src/features/agent/calendar/calendarPendingIntent';
import { findConflictingTimedEvents } from '@/src/features/agent/calendar/calendarScheduleConflictCore';
import type { CalendarEvent } from '@/src/entities/calendar/types';

const referenceNow = new Date('2026-06-02T10:00:00-05:00');

describe('calendar pending intent and context', () => {
  beforeEach(() => {
    resetConversationEventMemory('test');
    clearPendingIntent('test');
    touchCalendarConversationContext();
  });

  it('stores pending MOVE intent and resolves before lastReferenced', () => {
    recordCreatedConversationEvent({
      eventId: 'walk-2000',
      title: 'Прогулянка',
      startISO: '2026-06-02T20:00:00-05:00',
      endISO: '2026-06-02T21:00:00-05:00',
    });

    setPendingIntentForClarification({
      intent: 'MOVE_EVENT',
      title: 'Прогулянка',
      sourceTranscript: 'Перенеси прогулку',
      eventId: 'walk-2000',
      startISO: '2026-06-02T20:00:00-05:00',
      endISO: '2026-06-02T21:00:00-05:00',
    });

    assert.equal(getPendingIntent()?.intent, 'MOVE_EVENT');
    assert.equal(resolveMoveEventReference(referenceNow)?.eventId, 'walk-2000');
  });

  it('does not require title when lastReferencedEvent exists for move', () => {
    recordCreatedConversationEvent({
      eventId: 'meditation-2200',
      title: 'Медитація',
      startISO: '2026-06-02T22:00:00-05:00',
      endISO: '2026-06-02T23:00:00-05:00',
    });

    const extracted = extractCalendarUpdateParameters('Перенеси на годину пізніше', referenceNow);

    assert.equal(extracted.title, 'Медитація');
    assert.equal(extracted.missingFields.includes('title'), false);
  });

  it('keeps context fresh for at least 10 conversation turns', () => {
    touchCalendarConversationContext();

    for (let turn = 0; turn < CONVERSATION_CONTEXT_MAX_TURNS - 1; turn += 1) {
      advanceCalendarConversationTurn();
      assert.equal(isCalendarConversationContextFresh(), true);
    }

    advanceCalendarConversationTurn();
    assert.equal(isCalendarConversationContextFresh(), false);
  });

  it('ignores self-created event id during conflict detection', () => {
    const created: CalendarEvent = {
      id: 'self-created',
      title: 'Медитация',
      startsAt: '2026-06-02T21:00:00-05:00',
      endsAt: '2026-06-02T22:00:00-05:00',
      isAllDay: false,
    };

    const conflicts = findConflictingTimedEvents({
      events: [created],
      proposedStartMs: Date.parse(created.startsAt),
      proposedEndMs: Date.parse(created.endsAt),
      ignoreEventId: created.id,
    });

    assert.equal(conflicts.length, 0);
  });
});
