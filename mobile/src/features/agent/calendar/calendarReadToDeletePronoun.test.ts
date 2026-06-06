import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import type { CalendarEvent } from '@/src/entities/calendar/types';
import { buildDeterministicCalendarAnswer } from '@/src/features/agent/calendarIntelligence/calendarAnswerEngine';
import {
  getConversationEventMemory,
  recordSearchedConversationEvent,
  resetConversationEventMemory,
  setPendingEventFromAction,
} from '@/src/features/agent/calendar/calendarConversationEventMemory';
import {
  buildCalendarPendingAction,
  getCalendarConversationSnapshot,
  resetCalendarConversationStore,
} from '@/src/features/agent/calendar/calendarConversationStore';
import { resolveCalendarDeleteTargetFromEvents } from '@/src/features/agent/calendar/calendarDeleteResolution';
import { findCalendarEventForDeleteFromEvents } from '@/src/features/agent/calendarIntelligence/eventAtTimeMatch';
import { getLastCalendarReadMatch } from '@/src/features/agent/execution/calendarExecutionSession';

const referenceNow = new Date('2026-06-02T10:00:00-05:00');
const timeZone = 'America/Chicago';

function trainingAt11(): CalendarEvent {
  return {
    id: 'evt-training-11',
    title: 'Training',
    startsAt: '2026-06-02T11:00:00-05:00',
    endsAt: '2026-06-02T12:00:00-05:00',
    isAllDay: false,
  };
}

function meditationAt11(): CalendarEvent {
  return {
    id: 'med-11pm',
    title: 'Медитация',
    startsAt: '2026-06-02T23:00:00-05:00',
    endsAt: '2026-06-03T00:00:00-05:00',
    isAllDay: false,
  };
}

describe('read at time → delete pronoun', () => {
  beforeEach(() => {
    resetCalendarConversationStore('test_reset');
    resetConversationEventMemory('test_reset');
  });

  it('records lastReferenced and read pin after a single match at 11 AM', () => {
    const answer = buildDeterministicCalendarAnswer({
      transcript: 'What do I have at 11 AM?',
      events: [trainingAt11()],
      referenceNow,
      timeZone,
    });

    assert.ok(answer);
    assert.equal(answer?.payload.count, 1);

    const memory = getConversationEventMemory();
    assert.equal(memory.lastReferencedEvent?.eventId, 'evt-training-11');
    assert.equal(memory.lastReferencedEvent?.title, 'Training');

    const readPin = getLastCalendarReadMatch();
    assert.equal(readPin?.eventId, 'evt-training-11');
    assert.equal(readPin?.clockMinutes, 11 * 60);
  });

  it('resolves Delete it via last read pin when the fresh list is empty', () => {
    buildDeterministicCalendarAnswer({
      transcript: 'What do I have at 11 AM?',
      events: [trainingAt11()],
      referenceNow,
      timeZone,
    });

    const deleted = findCalendarEventForDeleteFromEvents({
      transcript: 'Delete it',
      referenceNow,
      events: [],
      titleQuery: '',
    });

    assert.equal(deleted.match?.id, 'evt-training-11');
    assert.equal(deleted.matchSource, 'pinned_read');
  });

  it('resolves Russian read at 11 PM then Удали её to the referenced meditation', () => {
    const meditation = meditationAt11();

    const answer = buildDeterministicCalendarAnswer({
      transcript: 'Что у меня в 11 вечера?',
      events: [meditation],
      referenceNow,
      timeZone,
    });

    assert.ok(answer);
    assert.equal(answer?.payload.count, 1);
    assert.equal(getConversationEventMemory().lastReferencedEvent?.eventId, 'med-11pm');

    const resolution = resolveCalendarDeleteTargetFromEvents({
      events: [meditation],
      titleQuery: '',
      transcript: 'Удали её',
      referenceNow,
      timeZone,
    });

    assert.equal(resolution.status, 'unique');
    assert.equal(resolution.event.id, 'med-11pm');

    const deleted = findCalendarEventForDeleteFromEvents({
      transcript: 'Удали её',
      referenceNow,
      events: [meditation],
      titleQuery: '',
    });

    assert.equal(deleted.match?.id, 'med-11pm');
    assert.ok(
      deleted.matchSource === 'conversation_memory' || deleted.matchSource === 'pinned_read',
    );
  });

  it('does not let stale pending: targets shadow lastReferenced for pronoun delete', () => {
    setPendingEventFromAction(
      buildCalendarPendingAction({
        actionType: 'update',
        originalIntent: 'Move dentist',
        eventTitle: 'Dentist',
        sourceTranscript: 'Move dentist',
        languageCode: 'en-US',
        proposedStartMs: Date.parse('2026-06-02T13:00:00-05:00'),
        proposedEndMs: Date.parse('2026-06-02T14:00:00-05:00'),
        updateEventId: 'pending:stale',
        candidateEventId: 'pending:stale',
      }),
    );

    buildDeterministicCalendarAnswer({
      transcript: 'What do I have at 11 AM?',
      events: [trainingAt11()],
      referenceNow,
      timeZone,
    });

    assert.equal(getCalendarConversationSnapshot().state, 'IDLE');

    const deleted = findCalendarEventForDeleteFromEvents({
      transcript: 'Delete it',
      referenceNow,
      events: [],
      titleQuery: '',
    });

    assert.equal(deleted.match?.id, 'evt-training-11');
    assert.equal(deleted.matchSource, 'pinned_read');
  });
});
