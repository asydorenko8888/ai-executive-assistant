import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import {
  buildCalendarPendingAction,
  getCalendarConversationSnapshot,
  isCalendarConversationAwaitingInput,
  resetCalendarConversationState,
  transitionCalendarConversationState,
} from '@/src/features/agent/calendar/calendarConversationState';
import { classifyPendingCalendarReply } from '@/src/features/agent/calendar/calendarPendingReplyClassifier';
import { resolvePendingConflictResolution } from '@/src/features/agent/calendar/calendarPendingConflictResolution';
import {
  mergeTranscriptWithPendingIntent,
  setPendingIntentFromAction,
} from '@/src/features/agent/calendar/calendarPendingIntent';
import { dismissCalendarConflictConfirmationState } from '@/src/features/agent/calendar/calendarPendingStateLifecycle';
import { createCalendarToolFailure } from '@/src/features/agent/execution/calendarToolContract';
import {
  acknowledgeCalendarConflictConfirmation,
  endCalendarOperation,
  resetCalendarExecutionSession,
  setLastCalendarToolResponse,
  tryBeginCalendarOperation,
} from '@/src/features/agent/execution/calendarExecutionSession';

const referenceNow = new Date('2026-05-27T10:00:00-05:00');
const conflictStartMs = Date.parse('2026-05-28T14:00:00-05:00');
const conflictEndMs = Date.parse('2026-05-28T15:00:00-05:00');

function buildPendingCreateB() {
  return buildCalendarPendingAction({
    actionType: 'create',
    originalIntent: 'Добавь встречу B завтра в 14:00',
    eventTitle: 'Встреча B',
    sourceTranscript: 'Добавь встречу B завтра в 14:00',
    titleSourceTranscript: 'Добавь встречу B завтра в 14:00',
    languageCode: 'ru-RU',
    proposedStartMs: conflictStartMs,
    proposedEndMs: conflictEndMs,
    conflictEvents: [
      {
        eventId: 'event-a',
        title: 'Встреча A',
        startsAt: '2026-05-28T14:00:00-05:00',
        endsAt: '2026-05-28T15:00:00-05:00',
      },
    ],
  });
}

describe('conflict confirmation reply handling', () => {
  beforeEach(() => {
    resetCalendarConversationState('test_reset');
  });

  it('does not merge нет with pending create transcript during conflict decision', () => {
    const pending = buildPendingCreateB();

    transitionCalendarConversationState({
      toState: 'WAITING_CONFLICT_DECISION',
      pendingAction: pending,
      reason: 'test_conflict',
    });
    setPendingIntentFromAction(pending);

    assert.equal(mergeTranscriptWithPendingIntent('нет'), 'нет');
    assert.equal(classifyPendingCalendarReply('нет'), 'decline_proceed');
  });

  it('resolves нет as suggest alternatives so createEvent is never invoked', () => {
    const pending = buildPendingCreateB();

    transitionCalendarConversationState({
      toState: 'WAITING_CONFLICT_CONFIRMATION',
      pendingAction: pending,
      reason: 'test_conflict',
    });
    setPendingIntentFromAction(pending);

    const resolution = resolvePendingConflictResolution({
      pending,
      transcript: 'нет',
      classification: classifyPendingCalendarReply('нет'),
      referenceNow,
    });

    assert.equal(resolution.kind, 'suggest_alternatives');
  });

  it('does not treat unrelated conflict replies as alternate_time create commands', () => {
    const pending = buildPendingCreateB();

    transitionCalendarConversationState({
      toState: 'WAITING_CONFLICT_DECISION',
      pendingAction: pending,
      reason: 'test_conflict',
    });

    assert.equal(classifyPendingCalendarReply('может'), 'unrelated');

    const resolution = resolvePendingConflictResolution({
      pending,
      transcript: 'может',
      classification: 'unrelated',
      referenceNow,
    });

    assert.equal(resolution.kind, 'remind');
  });

  it('keeps conflict pending state until user approves or rejects', () => {
    const pending = buildPendingCreateB();

    transitionCalendarConversationState({
      toState: 'WAITING_CONFLICT_DECISION',
      pendingAction: pending,
      reason: 'test_conflict',
    });

    assert.equal(getCalendarConversationSnapshot().state, 'WAITING_CONFLICT_DECISION');
    assert.equal(getCalendarConversationSnapshot().pendingAction?.eventTitle, 'Встреча B');
  });

  it('exits conflict confirmation immediately when user approves execution', () => {
    const pending = buildPendingCreateB();

    transitionCalendarConversationState({
      toState: 'WAITING_CONFLICT_DECISION',
      pendingAction: pending,
      reason: 'test_conflict',
    });

    dismissCalendarConflictConfirmationState('conflict_confirmed', 'yes');

    assert.equal(getCalendarConversationSnapshot().state, 'IDLE');
    assert.equal(getCalendarConversationSnapshot().pendingAction, null);
    assert.equal(isCalendarConversationAwaitingInput(), false);
  });

  it('allows the confirmed mutation to run after a conflict-blocked attempt', () => {
    resetCalendarExecutionSession();
    const transcript = 'Move it 2 hours earlier';

    assert.equal(tryBeginCalendarOperation(transcript), true);
    endCalendarOperation({ failed: true });
    setLastCalendarToolResponse(
      createCalendarToolFailure('CALENDAR_SCHEDULE_CONFLICT', 'Schedule conflict awaiting confirmation'),
    );
    assert.equal(tryBeginCalendarOperation(transcript), false);

    acknowledgeCalendarConflictConfirmation();

    assert.equal(tryBeginCalendarOperation(transcript), true);
    endCalendarOperation({ failed: false });
  });
});
