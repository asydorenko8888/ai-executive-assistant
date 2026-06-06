import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import {
  buildCalendarPendingAction,
  getCalendarConversationSnapshot,
  resetCalendarConversationState,
  transitionCalendarConversationState,
} from '@/src/features/agent/calendar/calendarConversationState';
import {
  clearMoveUpdateWorkflowState,
  isCalendarMoveUpdateSelectionState,
  shouldClearMoveUpdateSelectionOnUnrelatedReply,
} from '@/src/features/agent/calendar/calendarMoveUpdateLifecycle';
import {
  clearPendingIntent,
  getPendingIntent,
  mergeTranscriptWithPendingIntent,
  setPendingIntentForClarification,
} from '@/src/features/agent/calendar/calendarPendingIntent';
import {
  finalizeCalendarPendingStateAfterMutation,
} from '@/src/features/agent/calendar/calendarPendingStateLifecycle';
import {
  getPendingCalendarUpdateContext,
  resetCalendarExecutionSession,
  setPendingCalendarUpdateContext,
} from '@/src/features/agent/execution/calendarExecutionSession';
import { createCalendarToolFailure, type CalendarToolResponse } from '@/src/features/agent/execution/calendarToolContract';
import { isVerifiedCalendarUpdateSuccess } from '@/src/features/agent/calendar/calendarExecutionContract';

const referenceNow = new Date('2026-05-28T16:00:00-05:00');

function verifiedUpdateTool(eventId: string): CalendarToolResponse {
  return {
    status: 'SUCCESS',
    eventId,
    event: {
      id: eventId,
      summary: 'Встреча с Николаем',
      startsAt: '2026-05-28T17:00:00-05:00',
      endsAt: '2026-05-28T18:00:00-05:00',
    },
    verified: true,
    verificationFetched: true,
  };
}

function seedAmbiguousMoveState() {
  setPendingCalendarUpdateContext({
    operation: 'update',
    action: 'move',
    title: 'Встреча с Николаем',
    fromStartISO: '2026-05-28T16:00:00-05:00',
    toStartISO: '2026-05-28T17:00:00-05:00',
    sourceTranscript: 'Перенеси встречу с Николаем на час позже',
    candidates: [
      {
        eventId: 'evt-1',
        title: 'Встреча с Николаем',
        startsAt: '2026-05-28T16:00:00-05:00',
        endsAt: '2026-05-28T17:00:00-05:00',
      },
      {
        eventId: 'evt-2',
        title: 'Встреча с Николаем (копия)',
        startsAt: '2026-05-28T16:00:00-05:00',
        endsAt: '2026-05-28T17:00:00-05:00',
      },
    ],
  });

  transitionCalendarConversationState({
    toState: 'WAITING_EVENT_SELECTION',
    pendingAction: buildCalendarPendingAction({
      actionType: 'update',
      originalIntent: 'Перенеси встречу с Николаем на час позже',
      eventTitle: 'Встреча с Николаем',
      sourceTranscript: 'Перенеси встречу с Николаем на час позже',
      languageCode: 'ru-RU',
      proposedStartMs: Date.parse('2026-05-28T17:00:00-05:00'),
      proposedEndMs: Date.parse('2026-05-28T18:00:00-05:00'),
    }),
    reason: 'ambiguous_move',
  });

  setPendingIntentForClarification({
    intent: 'MOVE_EVENT',
    title: 'Встреча с Николаем',
    sourceTranscript: 'Перенеси встречу с Николаем на час позже',
  });
}

describe('calendar move/update lifecycle', () => {
  beforeEach(() => {
    resetCalendarConversationState('test_reset');
    resetCalendarExecutionSession();
    clearPendingIntent('test_reset');
  });

  it('move 1 hour later clears pending state after verified success', () => {
    setPendingIntentForClarification({
      intent: 'MOVE_EVENT',
      title: 'Встреча с Николаем',
      sourceTranscript: 'Перенеси встречу с Николаем на час позже',
    });
    setPendingCalendarUpdateContext({
      operation: 'update',
      action: 'move',
      title: 'Встреча с Николаем',
      fromStartISO: '2026-05-28T16:00:00-05:00',
      toStartISO: '2026-05-28T17:00:00-05:00',
      sourceTranscript: 'Перенеси встречу с Николаем на час позже',
    });

    const tool = verifiedUpdateTool('evt-1');

    finalizeCalendarPendingStateAfterMutation({
      verified: isVerifiedCalendarUpdateSuccess(tool),
      tool,
      reason: 'update_completed',
      transcript: 'Перенеси встречу с Николаем на час позже',
    });

    assert.equal(getPendingIntent(), null);
    assert.equal(getPendingCalendarUpdateContext(), null);
    assert.equal(getCalendarConversationSnapshot().pendingAction, null);
    assert.equal(getCalendarConversationSnapshot().state, 'IDLE');
  });

  it('move 1 hour earlier clears pending state after verified success', () => {
    setPendingCalendarUpdateContext({
      operation: 'update',
      action: 'move',
      title: 'Встреча с Николаем',
      fromStartISO: '2026-05-28T17:00:00-05:00',
      toStartISO: '2026-05-28T16:00:00-05:00',
      sourceTranscript: 'Перенеси встречу с Николаем на час раньше',
    });

    const tool = verifiedUpdateTool('evt-1');
    tool.event = {
      ...tool.event!,
      startsAt: '2026-05-28T16:00:00-05:00',
      endsAt: '2026-05-28T17:00:00-05:00',
    };

    finalizeCalendarPendingStateAfterMutation({
      verified: isVerifiedCalendarUpdateSuccess(tool),
      tool,
      reason: 'update_completed',
      transcript: 'Перенеси встречу с Николаем на час раньше',
    });

    assert.equal(getPendingCalendarUpdateContext(), null);
    assert.equal(getCalendarConversationSnapshot().state, 'IDLE');
  });

  it('failed move clears all pending state', () => {
    seedAmbiguousMoveState();

    const tool = createCalendarToolFailure('VERIFY_FAILED', 'Google Calendar did not confirm the update.');

    finalizeCalendarPendingStateAfterMutation({
      verified: false,
      tool,
      reason: 'update_completed',
      transcript: 'Перенеси встречу с Николаем на час позже',
    });

    assert.equal(getPendingIntent(), null);
    assert.equal(getPendingCalendarUpdateContext(), null);
    assert.equal(getCalendarConversationSnapshot().pendingAction, null);
  });

  it('ambiguous move preserves minimal clarification state', () => {
    seedAmbiguousMoveState();

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
    assert.notEqual(getPendingCalendarUpdateContext(), null);
    assert.notEqual(getCalendarConversationSnapshot().pendingAction, null);
  });

  it('unrelated message after failed move is not merged with stale move transcript', () => {
    setPendingIntentForClarification({
      intent: 'MOVE_EVENT',
      title: 'Встреча с Николаем',
      sourceTranscript: 'Перенеси встречу с Николаем на час позже',
    });

    finalizeCalendarPendingStateAfterMutation({
      verified: false,
      tool: createCalendarToolFailure('VERIFY_FAILED', 'Google Calendar did not confirm the update.'),
      reason: 'update_completed',
    });

    assert.equal(getPendingIntent(), null);
    assert.equal(
      mergeTranscriptWithPendingIntent('что у меня сегодня в календаре'),
      'что у меня сегодня в календаре',
    );
  });

  it('unrelated message during ambiguous selection clears stale selection state', () => {
    seedAmbiguousMoveState();

    assert.equal(
      shouldClearMoveUpdateSelectionOnUnrelatedReply({
        conversationState: 'WAITING_EVENT_SELECTION',
        classification: 'unrelated',
        validSelectionFollowUp: false,
      }),
      true,
    );

    clearMoveUpdateWorkflowState('unrelated_during_event_selection', 'что у меня сегодня');

    assert.equal(getPendingIntent(), null);
    assert.equal(getPendingCalendarUpdateContext(), null);
    assert.equal(getCalendarConversationSnapshot().pendingAction, null);
    assert.equal(
      mergeTranscriptWithPendingIntent('добавь ужин в 19:00'),
      'добавь ужин в 19:00',
    );
  });

  it('repeated move commands do not stack pending update context', () => {
    setPendingCalendarUpdateContext({
      operation: 'update',
      action: 'move',
      title: 'Massage',
      fromStartISO: '2026-05-28T16:00:00-05:00',
      toStartISO: '2026-05-28T17:00:00-05:00',
      sourceTranscript: 'move massage one hour later',
    });

    const firstFailure = createCalendarToolFailure('CALENDAR_EVENT_NOT_FOUND', 'not found');

    finalizeCalendarPendingStateAfterMutation({
      verified: false,
      tool: firstFailure,
      reason: 'update_completed',
    });

    assert.equal(getPendingCalendarUpdateContext(), null);

    setPendingCalendarUpdateContext({
      operation: 'update',
      action: 'move',
      title: 'Dentist',
      fromStartISO: '2026-05-28T18:00:00-05:00',
      toStartISO: '2026-05-28T19:00:00-05:00',
      sourceTranscript: 'move dentist one hour later',
    });

    assert.equal(getPendingCalendarUpdateContext()?.title, 'Dentist');
    assert.notEqual(getPendingCalendarUpdateContext()?.sourceTranscript, 'move massage one hour later');
  });

  it('recognizes move/update selection awaiting states', () => {
    assert.equal(isCalendarMoveUpdateSelectionState('WAITING_EVENT_SELECTION'), true);
    assert.equal(isCalendarMoveUpdateSelectionState('WAITING_MOVE_CONFIRMATION'), true);
    assert.equal(isCalendarMoveUpdateSelectionState('IDLE'), false);
  });
});
