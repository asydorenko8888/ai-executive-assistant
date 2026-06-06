import type { CalendarPendingAction } from '@/src/features/agent/calendar/calendarConversationState';
import {
  getCalendarConversationSnapshot,
  isCalendarConflictDecisionState,
  isCalendarConversationAwaitingInput,
} from '@/src/features/agent/calendar/calendarConversationState';
import {
  CONVERSATION_CONTEXT_MAX_TURNS,
  isCalendarConversationContextFresh,
  touchCalendarConversationContext,
} from '@/src/features/agent/calendar/calendarConversationContext';
import { detectCalendarCommandIntent } from '@/src/features/agent/calendar/calendarCommandTypes';
import { isCalendarMoveUpdateSelectionState } from '@/src/features/agent/calendar/calendarMoveUpdateLifecycle';
import { isAwaitingEventDisambiguationSelectionReply } from '@/src/features/agent/calendar/calendarPendingReplyClassifier';
import { isNewCalendarCommandMessage } from '@/src/features/agent/calendar/calendarPendingReplyClassifier';
import { isBareCalendarShortReply } from '@/src/features/agent/calendar/calendarShortReply';

export type PendingIntentType = 'CREATE_EVENT' | 'MOVE_EVENT' | 'DELETE_EVENT';

export type PendingIntentSnapshot = {
  intent: PendingIntentType;
  eventId: string | null;
  title: string;
  startISO: string;
  endISO: string;
  sourceTranscript: string;
  savedAtMs: number;
};

let pendingIntent: PendingIntentSnapshot | null = null;

export function mapPendingActionToIntent(action: CalendarPendingAction['action']): PendingIntentType {
  if (action === 'UPDATE_EVENT') {
    return 'MOVE_EVENT';
  }

  if (action === 'DELETE_EVENT') {
    return 'DELETE_EVENT';
  }

  return 'CREATE_EVENT';
}

export function setPendingIntent(snapshot: PendingIntentSnapshot) {
  pendingIntent = { ...snapshot, savedAtMs: Date.now() };
  touchCalendarConversationContext();

  console.log('[PENDING INTENT SET]');
  console.log(
    JSON.stringify({
      intent: pendingIntent.intent,
      eventId: pendingIntent.eventId,
      title: pendingIntent.title,
      startISO: pendingIntent.startISO,
    }),
  );
}

export function setPendingIntentFromAction(pending: CalendarPendingAction) {
  setPendingIntent({
    intent: mapPendingActionToIntent(pending.action),
    eventId: pending.updateEventId ?? pending.candidateEventId ?? null,
    title: pending.eventTitle,
    startISO: new Date(pending.requestedStartMs).toISOString(),
    endISO: new Date(pending.requestedEndMs).toISOString(),
    sourceTranscript: pending.sourceTranscript,
    savedAtMs: Date.now(),
  });
}

export function setPendingIntentForClarification(params: {
  intent: PendingIntentType;
  title: string;
  sourceTranscript: string;
  eventId?: string | null;
  startISO?: string;
  endISO?: string;
}) {
  setPendingIntent({
    intent: params.intent,
    eventId: params.eventId ?? null,
    title: params.title.trim() || 'event',
    startISO: params.startISO ?? new Date(0).toISOString(),
    endISO: params.endISO ?? new Date(0).toISOString(),
    sourceTranscript: params.sourceTranscript.trim(),
    savedAtMs: Date.now(),
  });
}

export function getPendingIntent() {
  if (!pendingIntent || !isPendingIntentFresh()) {
    return null;
  }

  return pendingIntent;
}

export function isPendingIntentFresh() {
  return pendingIntent !== null && isCalendarConversationContextFresh();
}

export function clearPendingIntent(reason?: string) {
  if (!pendingIntent) {
    return;
  }

  pendingIntent = null;
  console.log('[PENDING INTENT CLEARED]');
  if (reason) {
    console.log(`reason=${reason}`);
  }
}

export function mergeTranscriptWithPendingIntent(transcript: string) {
  const pending = getPendingIntent();

  if (!pending) {
    return transcript;
  }

  const normalized = transcript.trim();

  if (!normalized) {
    return pending.sourceTranscript;
  }

  // Never merge yes/no/cancel replies — that reconstitutes a create command and triggers createEvent().
  if (isBareCalendarShortReply(normalized)) {
    return normalized;
  }

  const snapshot = getCalendarConversationSnapshot();

  if (isCalendarConflictDecisionState(snapshot.state)) {
    return normalized;
  }

  if (isCalendarMoveUpdateSelectionState(snapshot.state) && isNewCalendarCommandMessage(normalized)) {
    return normalized;
  }

  if (
    isCalendarMoveUpdateSelectionState(snapshot.state) &&
    isAwaitingEventDisambiguationSelectionReply(normalized)
  ) {
    return normalized;
  }

  if (!snapshot.pendingAction && pending.intent === 'MOVE_EVENT') {
    const looksLikeMoveFollowUp =
      /\b(?:later|earlier|позже|пізніше|раньше|раніше)\b/iu.test(normalized) ||
      /\d{1,2}:\d{2}/.test(normalized);

    if (!looksLikeMoveFollowUp) {
      if (
        isNewCalendarCommandMessage(normalized) ||
        detectCalendarCommandIntent(normalized) === 'none'
      ) {
        return normalized;
      }
    }
  }

  // Never auto-continue a stale pendingAction workflow; only merge for clarification
  // intent or when the conversation is explicitly awaiting user input.
  if (snapshot.pendingAction && !isCalendarConversationAwaitingInput()) {
    return normalized;
  }

  return `${pending.sourceTranscript} ${normalized}`.replace(/\s+/g, ' ').trim();
}

export { CONVERSATION_CONTEXT_MAX_TURNS };
