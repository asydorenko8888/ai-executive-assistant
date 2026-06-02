import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { getActiveCalendarEvent } from '@/src/features/agent/calendar/calendarActiveEventContext';
import {
  buildCalendarPendingAction,
  getCalendarConversationSnapshot,
  transitionCalendarConversationState,
} from '@/src/features/agent/calendar/calendarConversationState';
import {
  getConversationEventMemory,
  recordCreatedConversationEvent,
  resetConversationEventMemory,
} from '@/src/features/agent/calendar/calendarConversationEventMemory';
import { resolveMutationSearchDayOffset } from '@/src/features/agent/calendar/calendarActiveEventContext';
import { enrichCalendarCommandTranscript } from '@/src/features/agent/calendar/calendarTranscriptEnrichment';
import { resolvePendingConflictResolution } from '@/src/features/agent/calendar/calendarPendingConflictResolution';
import { classifyPendingCalendarReply } from '@/src/features/agent/calendar/calendarPendingReplyClassifier';
import {
  findCalendarEventForDeleteFromEvents,
  findCalendarEventForUpdateFromEvents,
} from '@/src/features/agent/calendarIntelligence/eventAtTimeMatch';
import type { CalendarEvent } from '@/src/entities/calendar/types';

const referenceNow = new Date('2026-06-02T10:00:00-05:00');

function walkTomorrow11(): CalendarEvent {
  return {
    id: 'walk-tomorrow-1100',
    title: 'Прогулка',
    startsAt: '2026-06-03T11:00:00-05:00',
    endsAt: '2026-06-03T12:00:00-05:00',
    isAllDay: false,
  };
}

function meditationTomorrow13(): CalendarEvent {
  return {
    id: 'meditation-tomorrow-1300',
    title: 'Медитация',
    startsAt: '2026-06-03T13:00:00-05:00',
    endsAt: '2026-06-03T14:00:00-05:00',
    isAllDay: false,
  };
}

function simulateCreateWalkTomorrow11() {
  recordCreatedConversationEvent({
    eventId: walkTomorrow11().id,
    title: walkTomorrow11().title,
    startISO: walkTomorrow11().startsAt,
    endISO: walkTomorrow11().endsAt,
  });
}

describe('calendar conversation context retention', () => {
  beforeEach(() => {
    resetConversationEventMemory('test');
  });

  it('1: create walk tomorrow 11:00 -> move her 2 hours later -> 13:00', () => {
    simulateCreateWalkTomorrow11();

    const enriched = enrichCalendarCommandTranscript({
      transcript: 'перенеси её на 2 часа позже',
      referenceNow,
    });

    const resolved = findCalendarEventForUpdateFromEvents({
      transcript: enriched,
      referenceNow,
      events: [walkTomorrow11()],
      titleQuery: 'Прогулка',
    });

    assert.equal(resolved.match?.id, 'walk-tomorrow-1100');
    assert.equal(resolved.matchSource, 'conversation_memory');
    assert.equal(resolved.toMs, Date.parse('2026-06-03T13:00:00-05:00'));
  });

  it('2: create walk tomorrow 11:00 -> move walk 2 hours later -> 13:00', () => {
    simulateCreateWalkTomorrow11();

    const resolved = findCalendarEventForUpdateFromEvents({
      transcript: 'перенеси прогулку на 2 часа позже',
      referenceNow,
      events: [walkTomorrow11()],
      titleQuery: 'прогулку',
    });

    assert.equal(resolved.match?.id, 'walk-tomorrow-1100');
    assert.equal(resolved.matchSource, 'conversation_memory');
    assert.equal(resolved.toMs, Date.parse('2026-06-03T13:00:00-05:00'));
  });

  it('3: create meditation -> move -> delete same event chain', () => {
    recordCreatedConversationEvent({
      eventId: meditationTomorrow13().id,
      title: meditationTomorrow13().title,
      startISO: meditationTomorrow13().startsAt,
      endISO: meditationTomorrow13().endsAt,
    });

    const moved = findCalendarEventForUpdateFromEvents({
      transcript: 'перенеси медитацию на 15:00 завтра',
      referenceNow,
      events: [meditationTomorrow13()],
      titleQuery: 'медитацию',
    });

    assert.equal(moved.match?.id, 'meditation-tomorrow-1300');
    assert.equal(moved.toMs, Date.parse('2026-06-03T15:00:00-05:00'));

    recordCreatedConversationEvent({
      eventId: meditationTomorrow13().id,
      title: meditationTomorrow13().title,
      startISO: '2026-06-03T15:00:00-05:00',
      endISO: '2026-06-03T16:00:00-05:00',
    });

    const deleted = findCalendarEventForDeleteFromEvents({
      transcript: 'удали медитацию завтра',
      referenceNow,
      events: [
        {
          ...meditationTomorrow13(),
          startsAt: '2026-06-03T15:00:00-05:00',
          endsAt: '2026-06-03T16:00:00-05:00',
        },
      ],
      titleQuery: 'медитацию',
    });

    assert.equal(deleted.match?.id, 'meditation-tomorrow-1300');
    assert.equal(deleted.matchSource, 'conversation_memory');
  });

  it('4: after conflict cancelled with нет, pending action is cleared', () => {
    const pending = buildCalendarPendingAction({
      actionType: 'create',
      originalIntent: 'Добавь медитацию завтра в 13:00',
      eventTitle: 'Медитация',
      sourceTranscript: 'Добавь медитацию завтра в 13:00',
      languageCode: 'ru-RU',
      proposedStartMs: Date.parse('2026-06-03T13:00:00-05:00'),
      proposedEndMs: Date.parse('2026-06-03T14:00:00-05:00'),
    });

    transitionCalendarConversationState({
      toState: 'WAITING_CONFLICT_DECISION',
      pendingAction: pending,
      reason: 'test_conflict',
    });

    const decline = resolvePendingConflictResolution({
      pending,
      transcript: 'нет',
      classification: classifyPendingCalendarReply('нет'),
      referenceNow,
    });

    assert.equal(decline.kind, 'cancel');
  });

  it('4b: time refinement while pending still executes updated schedule', () => {
    const pending = buildCalendarPendingAction({
      actionType: 'create',
      originalIntent: 'Добавь медитацию завтра в 13:00',
      eventTitle: 'Медитация',
      sourceTranscript: 'Добавь медитацию завтра в 13:00',
      languageCode: 'ru-RU',
      proposedStartMs: Date.parse('2026-06-03T13:00:00-05:00'),
      proposedEndMs: Date.parse('2026-06-03T14:00:00-05:00'),
    });

    const followUp = resolvePendingConflictResolution({
      pending,
      transcript: 'завтра в 15:00',
      classification: classifyPendingCalendarReply('завтра в 15:00'),
      referenceNow,
    });

    assert.equal(followUp.kind, 'execute_with_schedule');
    if (followUp.kind === 'execute_with_schedule') {
      assert.equal(followUp.startMs, Date.parse('2026-06-03T15:00:00-05:00'));
    }
  });

  it('stores activeCalendarEvent with last_created source after create', () => {
    simulateCreateWalkTomorrow11();

    const active = getActiveCalendarEvent(referenceNow);

    assert.ok(active);
    assert.equal(active?.eventId, 'walk-tomorrow-1100');
    assert.equal(active?.title, 'Прогулка');
    assert.equal(active?.activeSource, 'last_created');
    assert.equal(active?.dateKey, '2026-06-03');
    assert.equal(getConversationEventMemory().lastReferencedEvent?.eventId, 'walk-tomorrow-1100');
  });

  it('uses memory day offset when follow-up lacks explicit day', () => {
    simulateCreateWalkTomorrow11();

    const dayOffset = resolveMutationSearchDayOffset({
      transcript: 'перенеси её на 2 часа позже',
      referenceNow,
    });

    assert.equal(dayOffset, 1);
  });

  it('resolves pronoun delete without title clarification', () => {
    simulateCreateWalkTomorrow11();

    const deleted = findCalendarEventForDeleteFromEvents({
      transcript: 'удали её',
      referenceNow,
      events: [walkTomorrow11()],
      titleQuery: '',
    });

    assert.equal(deleted.match?.id, 'walk-tomorrow-1100');
    assert.equal(deleted.matchSource, 'conversation_memory');
  });
});
