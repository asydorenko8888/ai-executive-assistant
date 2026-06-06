import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import {
  buildCalendarPendingAction,
  resetCalendarConversationState,
  transitionCalendarConversationState,
} from '@/src/features/agent/calendar/calendarConversationState';
import { tryMergePendingCalendarUpdateReply } from '@/src/features/agent/calendar/calendarUpdatePendingContext';
import { extractCalendarUpdateParameters } from '@/src/features/agent/calendar/calendarUpdateIntentExtractor';
import { createCalendarToolFailure } from '@/src/features/agent/execution/calendarToolContract';
import {
  acknowledgeCalendarConflictConfirmation,
  endCalendarOperation,
  forceResetCalendarOperationLock,
  getCalendarOperationLockSnapshot,
  getPendingCalendarUpdateContext,
  resetCalendarExecutionSession,
  setLastCalendarToolResponse,
  setPendingCalendarUpdateContext,
  tryBeginCalendarOperation,
} from '@/src/features/agent/execution/calendarExecutionSession';

const referenceNow = new Date('2026-05-28T20:00:00-05:00');
const sourceTranscript = 'Перенеси медитацию на 2 часа позже';

const candidates = [
  {
    eventId: 'med-8pm',
    title: 'Медитация',
    startsAt: '2026-05-28T20:00:00-05:00',
    endsAt: '2026-05-28T21:00:00-05:00',
  },
  {
    eventId: 'med-10pm',
    title: 'Медитация',
    startsAt: '2026-05-28T22:00:00-05:00',
    endsAt: '2026-05-28T23:00:00-05:00',
  },
];

describe('calendar update operation lock', () => {
  beforeEach(() => {
    resetCalendarExecutionSession();
    resetCalendarConversationState('test_reset');
  });

  it('resets a stuck in-progress lock before retrying', () => {
    assert.equal(tryBeginCalendarOperation('selected-update:med-8pm'), true);
    assert.equal(getCalendarOperationLockSnapshot().inProgress, true);

    forceResetCalendarOperationLock('test_reset');

    assert.equal(getCalendarOperationLockSnapshot().inProgress, false);
    assert.equal(tryBeginCalendarOperation('confirmed-update:med-8pm'), true);
    endCalendarOperation({ failed: false });
  });

  it('does not consume retry budget for schedule conflict awaiting confirmation', () => {
    const transcript = 'selected-update:med-8pm';

    assert.equal(tryBeginCalendarOperation(transcript), true);
    endCalendarOperation({ failed: true, failureReason: 'schedule_conflict_blocked' });
    setLastCalendarToolResponse(
      createCalendarToolFailure('CALENDAR_SCHEDULE_CONFLICT', 'Schedule conflict awaiting confirmation'),
    );

    acknowledgeCalendarConflictConfirmation();

    assert.equal(tryBeginCalendarOperation('confirmed-update:med-8pm'), true);
    endCalendarOperation({ failed: false });
  });
});

describe('calendar update conflict selection gate', () => {
  beforeEach(() => {
    resetCalendarExecutionSession();
    resetCalendarConversationState('test_reset');
  });

  it('does not treat conflict confirmation "Да" as disambiguation selection', () => {
    const extracted = extractCalendarUpdateParameters(sourceTranscript, referenceNow);
    const pending = {
      operation: 'update' as const,
      action: 'move' as const,
      title: extracted.title,
      fromStartISO: '2026-05-28T20:00:00-05:00',
      toStartISO: '2026-05-28T22:00:00-05:00',
      sourceTranscript,
      candidates,
      selectedEventId: 'med-8pm',
    };

    setPendingCalendarUpdateContext(pending);

    const merged = tryMergePendingCalendarUpdateReply({
      pending,
      reply: 'Да',
      referenceNow,
    });

    assert.equal(merged, null);
  });

  it('keeps conflict state active while update pending context retains selected event', () => {
    const pendingAction = buildCalendarPendingAction({
      actionType: 'update',
      originalIntent: sourceTranscript,
      eventTitle: 'Медитация',
      sourceTranscript,
      languageCode: 'ru-RU',
      proposedStartMs: Date.parse('2026-05-28T22:00:00-05:00'),
      proposedEndMs: Date.parse('2026-05-28T23:00:00-05:00'),
      updateEventId: 'med-8pm',
      targetEventId: 'med-8pm',
      targetEventTitle: 'Медитация',
      originalStart: '2026-05-28T20:00:00-05:00',
      originalEnd: '2026-05-28T21:00:00-05:00',
      conflictEvents: [
        {
          eventId: 'walk-10pm',
          title: 'Прогулка',
          startsAt: '2026-05-28T22:00:00-05:00',
          endsAt: '2026-05-28T23:00:00-05:00',
        },
      ],
    });

    transitionCalendarConversationState({
      toState: 'WAITING_CONFLICT_DECISION',
      pendingAction,
      reason: 'test_conflict',
    });

    const extracted = extractCalendarUpdateParameters(sourceTranscript, referenceNow);

    setPendingCalendarUpdateContext({
      operation: 'update',
      action: 'move',
      title: extracted.title,
      fromStartISO: '2026-05-28T20:00:00-05:00',
      toStartISO: '2026-05-28T22:00:00-05:00',
      sourceTranscript,
      candidates,
      selectedEventId: 'med-8pm',
    });

    assert.equal(
      tryMergePendingCalendarUpdateReply({
        pending: getPendingCalendarUpdateContext()!,
        reply: 'Да',
        referenceNow,
      }),
      null,
    );
  });
});
