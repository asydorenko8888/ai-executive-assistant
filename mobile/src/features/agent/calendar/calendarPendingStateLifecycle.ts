import {
  getCalendarConversationSnapshot,
  isCalendarConversationAwaitingInput,
  resetCalendarConversationState,
  type CalendarPendingAction,
} from '@/src/features/agent/calendar/calendarConversationState';
import {
  clearPendingCalendarConflictContext,
  clearPendingCalendarDeleteIntent,
  clearPendingCalendarUpdateIntent,
} from '@/src/features/agent/execution/calendarExecutionSession';

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

export function clearPendingCalendarState(reason: string, incomingMessage?: string) {
  if (!isCalendarConversationAwaitingInput()) {
    clearPendingCalendarConflictContext();
    clearPendingCalendarUpdateIntent();
    clearPendingCalendarDeleteIntent();
    return;
  }

  const pending = getCalendarConversationSnapshot().pendingAction;

  resetCalendarConversationState(reason, incomingMessage);
  clearPendingCalendarConflictContext();
  clearPendingCalendarUpdateIntent();
  clearPendingCalendarDeleteIntent();

  console.log('[PENDING STATE CLEARED]');
  console.log(`reason=${reason}`);
  console.log(`pendingActionId=${pending?.pendingActionId ?? 'none'}`);

  if (incomingMessage) {
    console.log(`incomingMessage=${incomingMessage.slice(0, 160)}`);
  }
}

export function expirePendingCalendarStateIfStale(referenceNow: Date) {
  const snapshot = getCalendarConversationSnapshot();

  if (!snapshot.pendingAction) {
    return false;
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
