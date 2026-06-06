import {
  getCalendarConversationSnapshot,
  isCalendarConflictDecisionState,
  isCalendarConversationAwaitingInput,
  resetCalendarConversationState,
  type CalendarPendingAction,
} from '@/src/features/agent/calendar/calendarConversationState';
import { clearPendingEventInMemory } from '@/src/features/agent/calendar/calendarConversationEventMemory';
import { isCalendarConversationContextFresh } from '@/src/features/agent/calendar/calendarConversationContext';
import { clearPendingIntent } from '@/src/features/agent/calendar/calendarPendingIntent';
import type { CalendarToolResponse } from '@/src/features/agent/execution/calendarToolContract';
import { logCalendarMoveWorkflow } from '@/src/features/agent/calendar/calendarMoveWorkflowLogger';
import {
  clearPendingCalendarConflictContext,
  clearPendingCalendarDeleteIntent,
  clearPendingCalendarUpdateIntent,
} from '@/src/features/agent/execution/calendarExecutionSession';

const PENDING_PRESERVING_ERROR_CODES = new Set([
  'CALENDAR_EVENT_AMBIGUOUS',
  'CALENDAR_SCHEDULE_CONFLICT',
]);

export const PENDING_CALENDAR_ACTION_TTL_MS = 3 * 60 * 1000;

export function createPendingActionId() {
  return `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function logPendingStateCreated(pending: CalendarPendingAction) {
  console.log('[PENDING STATE CREATED]');
  console.log(
    JSON.stringify({
      pendingActionId: pending.pendingActionId,
      actionType: pending.actionType,
      originalIntentPreview: pending.originalIntent.slice(0, 120),
      candidateEventId: pending.candidateEventId,
      proposedStart: pending.requestedTimeIso,
      proposedEnd: new Date(pending.requestedEndMs).toISOString(),
      conflictEvents: pending.conflictEvents.map((event) => event.title),
      createdAt: new Date(pending.createdAtMs).toISOString(),
    }),
  );
}

/**
 * Exits conflict yes/no workflow immediately after the user confirms execution.
 * The in-flight mutation still uses the captured pending action object.
 */
export function dismissCalendarConflictConfirmationState(reason: string, incomingMessage?: string) {
  const snapshot = getCalendarConversationSnapshot();

  if (!isCalendarConflictDecisionState(snapshot.state)) {
    return;
  }

  resetCalendarConversationState(reason, incomingMessage);
  clearPendingIntent(reason);
  clearPendingCalendarConflictContext();
  clearPendingCalendarUpdateIntent();
}

export function shouldPreservePendingCalendarStateAfterOutcome(
  tool: CalendarToolResponse,
): boolean {
  if (tool.status === 'PENDING') {
    return true;
  }

  if (tool.errorCode && PENDING_PRESERVING_ERROR_CODES.has(tool.errorCode)) {
    return true;
  }

  return false;
}

/** Clears conversation pending state only after a verified Google Calendar mutation. */
export function clearPendingCalendarStateAfterVerifiedMutation(params: {
  verified: boolean;
  reason: string;
  transcript?: string;
}) {
  if (!params.verified) {
    return;
  }

  clearPendingCalendarState(params.reason, params.transcript);
}

/**
 * After a calendar mutation attempt, clear stale pending workflow unless the user
 * must still confirm or disambiguate (ambiguous match, schedule conflict, auth).
 */
export function finalizeCalendarPendingStateAfterMutation(params: {
  verified: boolean;
  tool: CalendarToolResponse;
  reason: string;
  transcript?: string;
}) {
  if (params.verified) {
    clearPendingCalendarState(params.reason, params.transcript);
    return;
  }

  if (shouldPreservePendingCalendarStateAfterOutcome(params.tool)) {
    console.log('[PENDING STATE PRESERVED]');
    console.log(`reason=${params.reason}`);
    console.log(`errorCode=${params.tool.errorCode ?? 'none'}`);
    return;
  }

  console.log('[PENDING STATE CLEARED AFTER FAILURE]');
  console.log(`reason=${params.reason}`);
  console.log(`errorCode=${params.tool.errorCode ?? 'none'}`);
  clearPendingCalendarState(`mutation_failed:${params.reason}`, params.transcript);
}

export function recoverStalePendingCalendarAction(incomingMessage?: string) {
  const snapshot = getCalendarConversationSnapshot();

  if (!snapshot.pendingAction || isCalendarConversationAwaitingInput()) {
    return false;
  }

  console.log('[PENDING STATE STALE RECOVERY]');
  console.log(`pendingActionId=${snapshot.pendingAction.pendingActionId}`);
  clearPendingCalendarState('stale_pending_action_recovery', incomingMessage);
  return true;
}

export function clearPendingCalendarState(reason: string, incomingMessage?: string) {
  const awaitingInput = isCalendarConversationAwaitingInput();
  const pending = getCalendarConversationSnapshot().pendingAction;

  clearPendingCalendarConflictContext();
  clearPendingCalendarUpdateIntent();
  clearPendingCalendarDeleteIntent();
  clearPendingEventInMemory();
  clearPendingIntent(reason);

  if (awaitingInput || pending) {
    resetCalendarConversationState(reason, incomingMessage);
  }

  console.log('[PENDING STATE CLEARED]');
  console.log(`reason=${reason}`);
  console.log(`pendingActionId=${pending?.pendingActionId ?? 'none'}`);
  console.log(`hadAwaitingInput=${awaitingInput}`);

  if (incomingMessage) {
    console.log(`incomingMessage=${incomingMessage.slice(0, 160)}`);
  }

  if (/update|move|mutation|selection|clarification/i.test(reason)) {
    logCalendarMoveWorkflow('MOVE_STATE_CLEARED', {
      reason,
      pendingActionId: pending?.pendingActionId ?? null,
    });
  }
}

export function expirePendingCalendarStateIfStale(referenceNow: Date) {
  const snapshot = getCalendarConversationSnapshot();

  if (!snapshot.pendingAction) {
    return false;
  }

  if (!isCalendarConversationContextFresh()) {
    console.log('[PENDING STATE EXPIRED]');
    console.log(`pendingActionId=${snapshot.pendingAction.pendingActionId}`);
    console.log('reason=conversation_turn_limit');

    clearPendingCalendarState('expired_after_turn_limit');
    return true;
  }

  const ageMs = referenceNow.getTime() - snapshot.pendingAction.createdAtMs;

  if (ageMs <= PENDING_CALENDAR_ACTION_TTL_MS) {
    return false;
  }

  console.log('[PENDING STATE EXPIRED]');
  console.log(`pendingActionId=${snapshot.pendingAction.pendingActionId}`);
  console.log(`ageMs=${ageMs}`);

  clearPendingCalendarState('expired_after_3_minutes');
  return true;
}

export function logNewCommandOverridesPending(params: {
  pendingActionId: string;
  transcript: string;
}) {
  console.log('[NEW COMMAND OVERRIDES PENDING]');
  console.log(`supersededPendingActionId=${params.pendingActionId}`);
  console.log(`transcript=${params.transcript.slice(0, 160)}`);
}
