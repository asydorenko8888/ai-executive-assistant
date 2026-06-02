import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import {
  buildCalendarPendingAction,
  resetCalendarConversationState,
  transitionCalendarConversationState,
} from '@/src/features/agent/calendar/calendarConversationState';
import {
  getConversationEventMemory,
  recordCreatedConversationEvent,
  recordModifiedConversationEvent,
  resetConversationEventMemory,
  resolveConversationEventReference,
  setPendingEventFromAction,
} from '@/src/features/agent/calendar/calendarConversationEventMemory';
import { enrichCalendarCommandTranscript } from '@/src/features/agent/calendar/calendarTranscriptEnrichment';
import { findCalendarEventForUpdateFromEvents } from '@/src/features/agent/calendarIntelligence/eventAtTimeMatch';
import type { CalendarEvent } from '@/src/entities/calendar/types';

const referenceNow = new Date('2026-06-02T10:00:00-05:00');

const callEvent: CalendarEvent = {
  id: 'call-nikolai',
  title: 'Call with Nikolai',
  startsAt: '2026-06-03T10:00:00-05:00',
  endsAt: '2026-06-03T11:00:00-05:00',
  isAllDay: false,
};

const dentistEvent: CalendarEvent = {
  id: 'dentist-1',
  title: 'Dentist',
  startsAt: '2026-06-03T09:00:00-05:00',
  endsAt: '2026-06-03T09:30:00-05:00',
  isAllDay: false,
};

const walkEvent: CalendarEvent = {
  id: 'walk-2000',
  title: 'Прогулянка',
  startsAt: '2026-06-02T20:00:00-05:00',
  endsAt: '2026-06-02T21:00:00-05:00',
  isAllDay: false,
};

const meditationEvent: CalendarEvent = {
  id: 'meditation-2200',
  title: 'Медитація',
  startsAt: '2026-06-02T22:00:00-05:00',
  endsAt: '2026-06-02T23:00:00-05:00',
  isAllDay: false,
};

describe('calendar conversation event memory', () => {
  beforeEach(() => {
    resetConversationEventMemory('test_reset');
    resetCalendarConversationState('test_reset');
  });

  it('resolves reference priority: pending > lastReferenced > lastModified > lastCreated', () => {
    recordCreatedConversationEvent({
      eventId: 'old',
      title: 'Old',
      startISO: '2026-06-01T10:00:00-05:00',
      endISO: '2026-06-01T11:00:00-05:00',
    });
    recordModifiedConversationEvent({
      eventId: 'modified',
      title: 'Modified',
      startISO: '2026-06-01T12:00:00-05:00',
      endISO: '2026-06-01T13:00:00-05:00',
    });
    recordCreatedConversationEvent({
      eventId: 'latest',
      title: 'Latest',
      startISO: '2026-06-01T14:00:00-05:00',
      endISO: '2026-06-01T15:00:00-05:00',
    });

    assert.equal(resolveConversationEventReference(referenceNow)?.title, 'Latest');

    setPendingEventFromAction(
      buildCalendarPendingAction({
        actionType: 'create',
        originalIntent: 'Добавь Переговоры',
        eventTitle: 'Переговоры',
        sourceTranscript: 'Добавь Переговоры',
        languageCode: 'ru-RU',
        proposedStartMs: Date.parse('2026-06-02T16:00:00-05:00'),
        proposedEndMs: Date.parse('2026-06-02T17:00:00-05:00'),
      }),
    );

    assert.equal(resolveConversationEventReference(referenceNow)?.title, 'Переговоры');
  });

  it('enriches "Move it 2 hours later" after creating Call with Nikolai', () => {
    recordCreatedConversationEvent({
      eventId: callEvent.id,
      title: callEvent.title,
      startISO: callEvent.startsAt,
      endISO: callEvent.endsAt,
    });

    const enriched = enrichCalendarCommandTranscript({
      transcript: 'Move it 2 hours later',
      referenceNow,
    });

    assert.match(enriched, /call with nikolai/i);
    assert.match(enriched, /2 hours later/i);
  });

  it('binds conflict follow-up "Tomorrow at 4 PM" to pending Negotiations title', () => {
    transitionCalendarConversationState({
      toState: 'WAITING_CONFLICT_DECISION',
      pendingAction: buildCalendarPendingAction({
        actionType: 'create',
        originalIntent: 'Create negotiations at 4 PM',
        eventTitle: 'Negotiations',
        sourceTranscript: 'Create negotiations at 4 PM',
        languageCode: 'en-US',
        proposedStartMs: Date.parse('2026-06-02T16:00:00-05:00'),
        proposedEndMs: Date.parse('2026-06-02T17:00:00-05:00'),
      }),
      reason: 'test',
    });

    const enriched = enrichCalendarCommandTranscript({
      transcript: 'Tomorrow at 4 PM',
      referenceNow,
    });

    assert.match(enriched, /negotiations/i);
    assert.match(enriched, /tomorrow/i);
  });

  it('pins Ukrainian її to last created event, not an older similar title', () => {
    recordCreatedConversationEvent({
      eventId: walkEvent.id,
      title: walkEvent.title,
      startISO: walkEvent.startsAt,
      endISO: walkEvent.endsAt,
    });
    recordCreatedConversationEvent({
      eventId: meditationEvent.id,
      title: meditationEvent.title,
      startISO: meditationEvent.startsAt,
      endISO: meditationEvent.endsAt,
    });

    const enriched = enrichCalendarCommandTranscript({
      transcript: 'Перенеси її на годину пізніше',
      referenceNow,
    });

    assert.match(enriched, /медитаці/i);

    const resolved = findCalendarEventForUpdateFromEvents({
      transcript: enriched,
      referenceNow,
      events: [walkEvent, meditationEvent],
      titleQuery: '',
    });

    assert.equal(resolved.match?.id, meditationEvent.id);
    assert.equal(resolved.matchSource, 'conversation_memory');
    assert.equal(resolved.toMs, Date.parse('2026-06-02T23:00:00-05:00'));
  });

  it('pins update matcher to last referenced event for relative shift without title', () => {
    recordCreatedConversationEvent({
      eventId: dentistEvent.id,
      title: dentistEvent.title,
      startISO: dentistEvent.startsAt,
      endISO: dentistEvent.endsAt,
    });
    recordCreatedConversationEvent({
      eventId: callEvent.id,
      title: callEvent.title,
      startISO: callEvent.startsAt,
      endISO: callEvent.endsAt,
    });

    const resolved = findCalendarEventForUpdateFromEvents({
      transcript: 'Move it 2 hours later',
      referenceNow,
      events: [dentistEvent, callEvent],
      titleQuery: '',
    });

    assert.equal(resolved.match?.id, callEvent.id);
    assert.equal(resolved.matchSource, 'conversation_memory');
    assert.equal(resolved.toMs, Date.parse('2026-06-03T12:00:00-05:00'));
  });

  it('clears pendingEvent after successful create while keeping lastCreated', () => {
    setPendingEventFromAction(
      buildCalendarPendingAction({
        actionType: 'create',
        originalIntent: 'x',
        eventTitle: 'Pending Title',
        sourceTranscript: 'x',
        languageCode: 'en-US',
        proposedStartMs: 1,
        proposedEndMs: 2,
      }),
    );

    recordCreatedConversationEvent({
      eventId: 'created-1',
      title: 'Created',
      startISO: '2026-06-01T10:00:00-05:00',
      endISO: '2026-06-01T11:00:00-05:00',
    });

    const mem = getConversationEventMemory();
    assert.equal(mem.pendingEvent, null);
    assert.equal(mem.lastCreatedEvent?.title, 'Created');
    assert.equal(mem.lastReferencedEvent?.title, 'Created');
  });
});
