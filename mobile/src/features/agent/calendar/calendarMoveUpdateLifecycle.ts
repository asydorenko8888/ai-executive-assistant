import type { CalendarConversationState } from '@/src/features/agent/calendar/calendarConversationState';
import { logCalendarMoveWorkflow } from '@/src/features/agent/calendar/calendarMoveWorkflowLogger';
import { clearPendingCalendarState } from '@/src/features/agent/calendar/calendarPendingStateLifecycle';
import type { PendingReplyClassification } from '@/src/features/agent/calendar/calendarPendingReplyClassifier';

export function isCalendarMoveUpdateSelectionState(state: CalendarConversationState) {
  return (
    state === 'WAITING_EVENT_SELECTION' ||
    state === 'AWAITING_EVENT_SELECTION' ||
    state === 'WAITING_MOVE_CONFIRMATION'
  );
}

/**
 * Unrelated or fresh commands during move/update disambiguation must not
 * re-run the stale workflow or merge into the old transcript.
 */
export function shouldClearMoveUpdateSelectionOnUnrelatedReply(params: {
  conversationState: CalendarConversationState;
  classification: PendingReplyClassification;
  validSelectionFollowUp: boolean;
}) {
  if (!isCalendarMoveUpdateSelectionState(params.conversationState)) {
    return false;
  }

  if (params.validSelectionFollowUp) {
    return false;
  }

  return params.classification === 'unrelated' || params.classification === 'new_calendar_command';
}

export function clearMoveUpdateWorkflowState(reason: string, incomingMessage?: string) {
  clearPendingCalendarState(reason, incomingMessage);
  logCalendarMoveWorkflow('MOVE_STATE_CLEARED', {
    reason,
    incomingPreview: incomingMessage?.slice(0, 120) ?? null,
  });
}
