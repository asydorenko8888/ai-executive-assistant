import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import {
  buildCalendarPendingAction,
  getCalendarConversationSnapshot,
  resetCalendarConversationState,
  transitionCalendarConversationState,
} from '@/src/features/agent/calendar/calendarConversationState';
import {
  clearPendingIntent,
  getPendingIntent,
  mergeTranscriptWithPendingIntent,
  setPendingIntentForClarification,
} from '@/src/features/agent/calendar/calendarPendingIntent';
import {
  clearPendingCalendarState,
  finalizeCalendarPendingStateAfterMutation,
  shouldPreservePendingCalendarStateAfterOutcome,
} from '@/src/features/agent/calendar/calendarPendingStateLifecycle';
import {
  getPendingCalendarUpdateContext,
  resetCalendarExecutionSession,
  setPendingCalendarUpdateContext,
} from '@/src/features/agent/execution/calendarExecutionSession';
import { createCalendarToolFailure } from '@/src/features/agent/execution/calendarToolContract';

describe('calendarPendingStateLifecycle', () => {
  beforeEach(() => {
    resetCalendarConversationState('test_reset');
    resetCalendarExecutionSession();
    clearPendingIntent('test_reset');
  });

  it('clears pending intent and update context after terminal move failure', () => {
    setPendingIntentForClarification({
      intent: 'MOVE_EVENT',
      title: 'Massage',
      sourceTranscript: 'move massage one hour later',
      eventId: 'massage-1',
      startISO: '2026-05-28T16:00:00-05:00',
      endISO: '2026-05-28T17:00:00-05:00',
    });
    setPendingCalendarUpdateContext({
      operation: 'update',
      action: 'move',
      title: 'Massage',
      fromStartISO: '2026-05-28T16:00:00-05:00',
      toStartISO: '2026-05-28T17:00:00-05:00',
      sourceTranscript: 'move massage one hour later',
      selectedEventId: 'massage-1',
    });

    const tool = createCalendarToolFailure('VERIFY_FAILED', 'Google Calendar did not confirm the update.');

    finalizeCalendarPendingStateAfterMutation({
      verified: false,
      tool,
      reason: 'update_completed',
      transcript: 'move massage one hour later',
    });

    assert.equal(getPendingIntent(), null);
    assert.equal(getPendingCalendarUpdateContext(), null);
  });

  it('preserves pending workflow for ambiguous event selection', () => {
    transitionCalendarConversationState({
      toState: 'WAITING_EVENT_SELECTION',
      pendingAction: buildCalendarPendingAction({
        actionType: 'update',
        originalIntent: 'move massage',
        eventTitle: 'Massage',
        sourceTranscript: 'move massage',
        languageCode: 'en-US',
        proposedStartMs: Date.parse('2026-05-28T16:00:00-05:00'),
        proposedEndMs: Date.parse('2026-05-28T17:00:00-05:00'),
      }),
      reason: 'update_event_ambiguous',
    });

    const tool = createCalendarToolFailure(
      'CALENDAR_EVENT_AMBIGUOUS',
      'Multiple matching calendar events found.',
    );

    finalizeCalendarPendingStateAfterMutation({
      verified: false,
      tool,
      reason: 'update_completed',
    });

    assert.equal(getCalendarConversationSnapshot().state, 'WAITING_EVENT_SELECTION');
    assert.notEqual(getCalendarConversationSnapshot().pendingAction, null);
    assert.equal(
      shouldPreservePendingCalendarStateAfterOutcome(tool),
      true,
    );
  });

  it('does not merge transcript when pendingAction is stale and not awaiting input', () => {
    transitionCalendarConversationState({
      toState: 'IDLE',
      pendingAction: buildCalendarPendingAction({
        actionType: 'update',
        originalIntent: 'move massage',
        eventTitle: 'Massage',
        sourceTranscript: 'move massage one hour later',
        languageCode: 'en-US',
        proposedStartMs: Date.parse('2026-05-28T16:00:00-05:00'),
        proposedEndMs: Date.parse('2026-05-28T17:00:00-05:00'),
      }),
      reason: 'stale_setup',
    });

    setPendingIntentForClarification({
      intent: 'MOVE_EVENT',
      title: 'Massage',
      sourceTranscript: 'move massage one hour later',
    });

    assert.equal(
      mergeTranscriptWithPendingIntent('what is on my calendar today'),
      'what is on my calendar today',
    );
  });

  it('still merges clarification follow-ups without pendingAction', () => {
    setPendingIntentForClarification({
      intent: 'MOVE_EVENT',
      title: 'Massage',
      sourceTranscript: 'move massage',
    });

    assert.equal(
      mergeTranscriptWithPendingIntent('one hour later'),
      'move massage one hour later',
    );
  });

  it('clearPendingCalendarState clears pending intent even when conversation is idle', () => {
    setPendingIntentForClarification({
      intent: 'MOVE_EVENT',
      title: 'Massage',
      sourceTranscript: 'move massage one hour later',
    });

    clearPendingCalendarState('mutation_failed:test');

    assert.equal(getPendingIntent(), null);
    assert.equal(getCalendarConversationSnapshot().pendingAction, null);
  });
});
