import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { buildCalendarUpdateConflictInitialReply } from '@/src/features/agent/calendar/calendarConflictReplies';
import {
  buildCalendarPendingAction,
  getCalendarConversationSnapshot,
  resetCalendarConversationState,
  transitionCalendarConversationState,
} from '@/src/features/agent/calendar/calendarConversationState';
import {
  getConversationEventMemory,
  recordCreatedConversationEvent,
  resolveMoveEventReference,
} from '@/src/features/agent/calendar/calendarConversationEventMemory';
import { resolvePendingConflictResolution } from '@/src/features/agent/calendar/calendarPendingConflictResolution';
import { classifyPendingCalendarReply } from '@/src/features/agent/calendar/calendarPendingReplyClassifier';

const referenceNow = new Date('2026-05-28T15:00:00-05:00');

function buildMeditationMovePending() {
  const meditationStartMs = Date.parse('2026-05-28T15:00:00-05:00');
  const meditationEndMs = Date.parse('2026-05-28T16:00:00-05:00');
  const dentistStartMs = Date.parse('2026-05-28T15:00:00-05:00');

  const pending = buildCalendarPendingAction({
    actionType: 'update',
    originalIntent: 'Move it 2 hours earlier',
    eventTitle: 'Meditation',
    sourceTranscript: 'Move it 2 hours earlier',
    titleSourceTranscript: 'Move it 2 hours earlier',
    languageCode: 'en-US',
    proposedStartMs: meditationStartMs,
    proposedEndMs: meditationEndMs,
    createdAtMs: referenceNow.getTime(),
    updateEventId: 'meditation',
    candidateEventId: 'meditation',
    conflictingEventId: 'dentist',
    conflictingTitle: 'Dentist',
    conflictingStartsAt: new Date(dentistStartMs).toISOString(),
    conflictingEndsAt: new Date(Date.parse('2026-05-28T16:00:00-05:00')).toISOString(),
    conflictEvents: [
      {
        eventId: 'dentist',
        title: 'Dentist',
        startsAt: new Date(dentistStartMs).toISOString(),
        endsAt: new Date(Date.parse('2026-05-28T16:00:00-05:00')).toISOString(),
      },
    ],
  });

  return {
    pending,
    conflictReply: buildCalendarUpdateConflictInitialReply({
      locale: 'en',
      proposedTitle: 'Meditation',
      conflict: {
        event: {
          id: 'dentist',
          title: 'Dentist',
          startsAt: new Date(dentistStartMs).toISOString(),
          endsAt: new Date(Date.parse('2026-05-28T16:00:00-05:00')).toISOString(),
          isAllDay: false,
        },
        startsAtMs: dentistStartMs,
        endsAtMs: Date.parse('2026-05-28T16:00:00-05:00'),
      },
      proposedStartMs: meditationStartMs,
      proposedEndMs: meditationEndMs,
    }),
  };
}

describe('move-into-conflict prompt', () => {
  it('asks for confirmation when Meditation would land on Dentist', () => {
    const { conflictReply } = buildMeditationMovePending();

    assert.match(conflictReply, /Dentist/i);
    assert.match(conflictReply, /Meditation/i);
    assert.match(conflictReply, /Move Meditation to .* anyway/i);
    assert.doesNotMatch(conflictReply, /won't move/i);
  });
});

describe('calendar execution honesty', () => {
  beforeEach(() => {
    resetCalendarConversationState('test_reset');
  });

  it('treats conversational move success as unacceptable without verification', () => {
    const fakeSuccess = 'I moved Meditation to 3 PM. Let me know if you need anything else.';

    assert.match(fakeSuccess, /I moved/i);
    assert.doesNotMatch(fakeSuccess, /Event rescheduled:/);
  });

  it('documents the in-progress user message copy', () => {
    const reply = 'Calendar is still updating. Please wait a moment.';

    assert.doesNotMatch(reply, /I moved/i);
    assert.doesNotMatch(reply, /^FAILURE:/);
  });

  it('keeps conflict pending state while awaiting user confirmation', () => {
    const { pending } = buildMeditationMovePending();

    transitionCalendarConversationState({
      toState: 'WAITING_CONFLICT_DECISION',
      pendingAction: pending,
      reason: 'test_conflict',
    });

    assert.equal(getCalendarConversationSnapshot().state, 'WAITING_CONFLICT_DECISION');
    assert.equal(getCalendarConversationSnapshot().pendingAction?.eventTitle, 'Meditation');
  });

  it('resolves yes on a move conflict to execute the requested move', () => {
    const { pending } = buildMeditationMovePending();
    const resolution = resolvePendingConflictResolution({
      pending,
      transcript: 'yes',
      classification: classifyPendingCalendarReply('yes'),
      referenceNow,
    });

    assert.equal(resolution.kind, 'execute_original');
  });

  it('preserves lastReferencedEvent when conflict pending is still active', () => {
    recordCreatedConversationEvent({
      eventId: 'dentist',
      title: 'Dentist',
      startISO: '2026-05-28T15:00:00-05:00',
      endISO: '2026-05-28T16:00:00-05:00',
    });

    recordCreatedConversationEvent({
      eventId: 'meditation',
      title: 'Meditation',
      startISO: '2026-05-28T17:00:00-05:00',
      endISO: '2026-05-28T18:00:00-05:00',
    });

    const { pending } = buildMeditationMovePending();

    transitionCalendarConversationState({
      toState: 'WAITING_CONFLICT_DECISION',
      pendingAction: pending,
      reason: 'test_conflict',
    });

    assert.equal(getCalendarConversationSnapshot().pendingAction?.eventTitle, 'Meditation');
    assert.equal(getConversationEventMemory().lastReferencedEvent?.title, 'Meditation');
    assert.equal(resolveMoveEventReference(referenceNow)?.eventId, 'meditation');
  });
});
