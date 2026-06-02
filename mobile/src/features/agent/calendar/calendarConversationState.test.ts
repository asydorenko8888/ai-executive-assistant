import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';

import { buildCalendarConflictCancelledReply } from '@/src/features/agent/calendar/calendarConflictReplies';
import {
  classifyCalendarShortReply,
} from '@/src/features/agent/calendar/calendarShortReply';
import {
  buildCalendarPendingAction,
  getCalendarConversationSnapshot,
  isAwaitingCalendarConflictResolution,
  resetCalendarConversationState,
  transitionCalendarConversationState,
} from '@/src/features/agent/calendar/calendarConversationState';
import { clearPendingCalendarStateAfterVerifiedMutation } from '@/src/features/agent/calendar/calendarPendingStateLifecycle';

describe('calendar conversation state', () => {
  beforeEach(() => {
    resetCalendarConversationState('test_reset');
  });

  it('classifies yes, no, and cancel replies', () => {
    assert.equal(classifyCalendarShortReply('yes'), 'proceed');
    assert.equal(classifyCalendarShortReply('no'), 'decline_proceed');
    assert.equal(classifyCalendarShortReply('cancel'), 'cancel_abort');
    assert.equal(classifyCalendarShortReply('suggest another time'), 'suggest_new_time');
  });

  it('transitions into conflict confirmation with pending action payload', () => {
    transitionCalendarConversationState({
      toState: 'WAITING_CONFLICT_CONFIRMATION',
      pendingAction: buildCalendarPendingAction({
        actionType: 'create',
        originalIntent: 'Add walk at 8 PM',
        eventTitle: 'Walk',
        sourceTranscript: 'Add walk at 8 PM',
        titleSourceTranscript: 'Add walk at 8 PM',
        languageCode: 'en-US',
        proposedStartMs: Date.parse('2026-06-01T20:00:00-05:00'),
        proposedEndMs: Date.parse('2026-06-01T21:00:00-05:00'),
      }),
      reason: 'schedule_conflict_detected',
    });

    const snapshot = getCalendarConversationSnapshot();

    assert.equal(snapshot.state, 'WAITING_CONFLICT_CONFIRMATION');
    assert.equal(snapshot.pendingAction?.eventTitle, 'Walk');
    assert.equal(snapshot.pendingAction?.action, 'CREATE_EVENT');
  });

  it('clears pending action and returns IDLE on cancel reset', () => {
    transitionCalendarConversationState({
      toState: 'WAITING_CONFLICT_CONFIRMATION',
      pendingAction: buildCalendarPendingAction({
        actionType: 'create',
        originalIntent: 'Add walk at 8 PM',
        eventTitle: 'Walk',
        sourceTranscript: 'Add walk at 8 PM',
        titleSourceTranscript: 'Add walk at 8 PM',
        languageCode: 'en-US',
        proposedStartMs: Date.parse('2026-06-01T20:00:00-05:00'),
        proposedEndMs: Date.parse('2026-06-01T21:00:00-05:00'),
      }),
      reason: 'test_setup',
    });

    resetCalendarConversationState('user_cancelled', 'no');

    assert.equal(getCalendarConversationSnapshot().state, 'IDLE');
    assert.equal(getCalendarConversationSnapshot().pendingAction, null);
    assert.match(buildCalendarConflictCancelledReply('en'), /did not change your calendar/i);
  });

  it('stores alternative times when entering WAITING_NEW_TIME', () => {
    const alternatives = [
      Date.parse('2026-06-01T21:00:00-05:00'),
      Date.parse('2026-06-01T22:00:00-05:00'),
    ];

    transitionCalendarConversationState({
      toState: 'WAITING_NEW_TIME',
      pendingAction: buildCalendarPendingAction({
        actionType: 'create',
        originalIntent: 'Add walk at 8 PM',
        eventTitle: 'Walk',
        sourceTranscript: 'Add walk at 8 PM',
        titleSourceTranscript: 'Add walk at 8 PM',
        languageCode: 'en-US',
        proposedStartMs: Date.parse('2026-06-01T20:00:00-05:00'),
        proposedEndMs: Date.parse('2026-06-01T21:00:00-05:00'),
        alternativeStartMs: alternatives,
      }),
      reason: 'conflict_alternatives_offered',
    });

    assert.deepEqual(getCalendarConversationSnapshot().pendingAction?.alternativeStartMs, alternatives);
    assert.equal(getCalendarConversationSnapshot().state, 'WAITING_NEW_TIME');
  });

  it('detects awaiting conflict resolution for alternative slot state', () => {
    assert.equal(isAwaitingCalendarConflictResolution(), false);

    transitionCalendarConversationState({
      toState: 'WAITING_ALTERNATIVE_SLOT',
      pendingAction: buildCalendarPendingAction({
        actionType: 'create',
        originalIntent: 'Добавь поход к Николаю 16:00',
        eventTitle: 'Поход к Николаю',
        sourceTranscript: 'Добавь поход к Николаю 16:00',
        languageCode: 'ru-RU',
        proposedStartMs: Date.parse('2026-06-01T16:00:00-05:00'),
        proposedEndMs: Date.parse('2026-06-01T17:00:00-05:00'),
        alternativeStartMs: [Date.parse('2026-06-01T17:00:00-05:00')],
      }),
      reason: 'test',
    });

    assert.equal(isAwaitingCalendarConflictResolution(), true);
  });

  it('does not clear conflict pending state when mutation verification fails', () => {
    const pending = buildCalendarPendingAction({
      actionType: 'update',
      originalIntent: 'Move it 2 hours earlier',
      eventTitle: 'Meditation',
      sourceTranscript: 'Move it 2 hours earlier',
      languageCode: 'en-US',
      proposedStartMs: Date.parse('2026-05-28T15:00:00-05:00'),
      proposedEndMs: Date.parse('2026-05-28T16:00:00-05:00'),
      updateEventId: 'meditation',
    });

    transitionCalendarConversationState({
      toState: 'WAITING_CONFLICT_DECISION',
      pendingAction: pending,
      reason: 'test_conflict',
    });

    clearPendingCalendarStateAfterVerifiedMutation({
      verified: false,
      reason: 'update_completed',
      transcript: 'yes',
    });

    assert.equal(getCalendarConversationSnapshot().state, 'WAITING_CONFLICT_DECISION');
    assert.equal(getCalendarConversationSnapshot().pendingAction?.eventTitle, 'Meditation');
  });
});
