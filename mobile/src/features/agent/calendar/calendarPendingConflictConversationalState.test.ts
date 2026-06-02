import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { pendingConflictContextFromCheck } from '@/src/features/agent/calendar/calendarConflictPendingContext';
import {
  resetCalendarConversationState,
  transitionCalendarConversationState,
} from '@/src/features/agent/calendar/calendarConversationState';
import { conflictContextToPendingAction } from '@/src/features/agent/calendar/calendarConversationSync';
import { classifyPendingCalendarReply } from '@/src/features/agent/calendar/calendarPendingReplyClassifier';
import { resolvePendingConflictResolution } from '@/src/features/agent/calendar/calendarPendingConflictResolution';
import {
  isPendingConflictScheduleUpdateReply,
  resolvePendingConflictScheduleUpdate,
} from '@/src/features/agent/calendar/calendarPendingConflictScheduleUpdate';
import { isCalendarReadBypassDuringPendingConflict } from '@/src/features/agent/calendar/calendarPendingConflictReadBypass';
import { isDeterministicCalendarReadQuery } from '@/src/features/agent/calendarIntelligence/classifyQuery';

const referenceNow = new Date('2026-05-28T12:00:00-05:00');

function buildMeditationWalkConflictPending() {
  const meditationStart = '2026-05-28T23:00:00-05:00';
  const meditationEnd = '2026-05-29T00:00:00-05:00';
  const walkStart = '2026-05-28T22:00:00-05:00';
  const walkEnd = '2026-05-28T23:00:00-05:00';
  const targetStartMs = Date.parse('2026-05-28T22:00:00-05:00');
  const targetEndMs = Date.parse('2026-05-28T23:00:00-05:00');

  return conflictContextToPendingAction(
    pendingConflictContextFromCheck({
      operation: 'update',
      sourceTranscript: 'Move Meditation 1 hour earlier',
      languageCode: 'en-US',
      proposedTitle: 'Meditation',
      proposedStartMs: targetStartMs,
      proposedEndMs: targetEndMs,
      updateEventId: 'meditation',
      targetOriginalStartsAt: meditationStart,
      targetOriginalEndsAt: meditationEnd,
      conflictingEventId: 'walk',
      conflictingTitle: 'Walk',
      conflictingStartsAt: walkStart,
      conflictingEndsAt: walkEnd,
    }),
    [
      {
        event: {
          id: 'walk',
          title: 'Walk',
          startsAt: walkStart,
          endsAt: walkEnd,
        },
      },
    ],
  );
}

describe('pending conflict conversational schedule updates', () => {
  beforeEach(() => {
    resetCalendarConversationState('test_reset');
  });

  it('classifies move-it-to refinements as alternate_time', () => {
    const pending = buildMeditationWalkConflictPending();

    transitionCalendarConversationState({
      toState: 'WAITING_CONFLICT_CONFIRMATION',
      pendingAction: pending,
      reason: 'test_conflict',
    });

    assert.equal(
      classifyPendingCalendarReply('move it to 11:30 PM instead'),
      'alternate_time',
    );
    assert.equal(isPendingConflictScheduleUpdateReply('move it to 11:30 PM instead'), true);
  });

  it('updates pending move target to 11:30 PM instead of conflict slot', () => {
    const pending = buildMeditationWalkConflictPending();
    const update = resolvePendingConflictScheduleUpdate({
      pending,
      reply: 'move it to 11:30 PM instead',
      referenceNow,
    });

    assert.equal(update.ok, true);

    if (update.ok) {
      assert.equal(update.startMs, Date.parse('2026-05-28T23:30:00-05:00'));
    }
  });

  it('resolves tomorrow at 10 AM as pending move update', () => {
    const pending = buildMeditationWalkConflictPending();
    const update = resolvePendingConflictScheduleUpdate({
      pending,
      reply: 'tomorrow at 10 AM',
      referenceNow,
    });

    assert.equal(update.ok, true);

    if (update.ok) {
      assert.equal(update.startMs, Date.parse('2026-05-29T10:00:00-05:00'));
    }
  });

  it('resolves one hour later relative to pending target', () => {
    const pending = buildMeditationWalkConflictPending();
    const update = resolvePendingConflictScheduleUpdate({
      pending,
      reply: 'one hour later',
      referenceNow,
    });

    assert.equal(update.ok, true);

    if (update.ok) {
      assert.equal(update.startMs, Date.parse('2026-05-28T23:00:00-05:00'));
    }
  });

  it('resolves after the walk using conflicting event end', () => {
    const pending = buildMeditationWalkConflictPending();
    const update = resolvePendingConflictScheduleUpdate({
      pending,
      reply: 'after the walk',
      referenceNow,
    });

    assert.equal(update.ok, true);

    if (update.ok) {
      assert.equal(update.startMs, Date.parse('2026-05-28T23:00:00-05:00'));
    }
  });

  it('executes updated schedule without yes/no when user names a new time', () => {
    const pending = buildMeditationWalkConflictPending();
    const resolution = resolvePendingConflictResolution({
      pending,
      transcript: 'move it to 11:30 PM instead',
      classification: classifyPendingCalendarReply('move it to 11:30 PM instead'),
      referenceNow,
    });

    assert.equal(resolution.kind, 'execute_with_schedule');

    if (resolution.kind === 'execute_with_schedule') {
      assert.equal(resolution.startMs, Date.parse('2026-05-28T23:30:00-05:00'));
    }
  });

  it('cancels pending action on bare no', () => {
    const pending = buildMeditationWalkConflictPending();
    const resolution = resolvePendingConflictResolution({
      pending,
      transcript: 'no',
      classification: classifyPendingCalendarReply('no'),
      referenceNow,
    });

    assert.equal(resolution.kind, 'cancel');
  });

  it('cancels pending action on cancel', () => {
    const pending = buildMeditationWalkConflictPending();
    const resolution = resolvePendingConflictResolution({
      pending,
      transcript: 'cancel',
      classification: classifyPendingCalendarReply('cancel'),
      referenceNow,
    });

    assert.equal(resolution.kind, 'cancel');
  });

  it('does not treat calendar read queries as pending schedule updates', () => {
    assert.equal(isPendingConflictScheduleUpdateReply('what do I have tonight'), false);
    assert.equal(isPendingConflictScheduleUpdateReply('what is at 10 PM'), false);
    assert.equal(isCalendarReadBypassDuringPendingConflict('what do I have tonight'), true);
    assert.equal(isDeterministicCalendarReadQuery('what is at 10 PM'), true);
  });
});
