import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';

import { buildCalendarConflictCancelledReply } from '@/src/features/agent/calendar/calendarConflictReplies';
import {
  classifyCalendarShortReply,
} from '@/src/features/agent/calendar/calendarShortReply';
import {
  getCalendarConversationSnapshot,
  resetCalendarConversationState,
  transitionCalendarConversationState,
} from '@/src/features/agent/calendar/calendarConversationState';

describe('calendar conversation state', () => {
  beforeEach(() => {
    resetCalendarConversationState('test_reset');
  });

  it('classifies yes, no, and cancel replies', () => {
    assert.equal(classifyCalendarShortReply('yes'), 'proceed');
    assert.equal(classifyCalendarShortReply('no'), 'cancel');
    assert.equal(classifyCalendarShortReply('cancel'), 'cancel');
    assert.equal(classifyCalendarShortReply('suggest another time'), 'suggest_new_time');
  });

  it('transitions into conflict confirmation with pending action payload', () => {
    transitionCalendarConversationState({
      toState: 'WAITING_CONFLICT_CONFIRMATION',
      pendingAction: {
        action: 'CREATE_EVENT',
        eventTitle: 'Walk',
        sourceTranscript: 'Add walk at 8 PM',
        titleSourceTranscript: 'Add walk at 8 PM',
        languageCode: 'en-US',
        requestedStartMs: Date.parse('2026-06-01T20:00:00-05:00'),
        requestedEndMs: Date.parse('2026-06-01T21:00:00-05:00'),
        requestedTimeIso: new Date(Date.parse('2026-06-01T20:00:00-05:00')).toISOString(),
      },
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
      pendingAction: {
        action: 'CREATE_EVENT',
        eventTitle: 'Walk',
        sourceTranscript: 'Add walk at 8 PM',
        titleSourceTranscript: 'Add walk at 8 PM',
        languageCode: 'en-US',
        requestedStartMs: Date.parse('2026-06-01T20:00:00-05:00'),
        requestedEndMs: Date.parse('2026-06-01T21:00:00-05:00'),
        requestedTimeIso: new Date(Date.parse('2026-06-01T20:00:00-05:00')).toISOString(),
      },
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
      pendingAction: {
        action: 'CREATE_EVENT',
        eventTitle: 'Walk',
        sourceTranscript: 'Add walk at 8 PM',
        titleSourceTranscript: 'Add walk at 8 PM',
        languageCode: 'en-US',
        requestedStartMs: Date.parse('2026-06-01T20:00:00-05:00'),
        requestedEndMs: Date.parse('2026-06-01T21:00:00-05:00'),
        requestedTimeIso: new Date(Date.parse('2026-06-01T20:00:00-05:00')).toISOString(),
        alternativeStartMs: alternatives,
      },
      reason: 'conflict_alternatives_offered',
    });

    assert.deepEqual(getCalendarConversationSnapshot().pendingAction?.alternativeStartMs, alternatives);
    assert.equal(getCalendarConversationSnapshot().state, 'WAITING_NEW_TIME');
  });
});
