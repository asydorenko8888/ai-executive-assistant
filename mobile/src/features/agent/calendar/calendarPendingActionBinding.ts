import {
  getCalendarConversationSnapshot,
  transitionCalendarConversationState,
  type CalendarPendingAction,
} from '@/src/features/agent/calendar/calendarConversationState';
import type { CalendarDisambiguationCandidate } from '@/src/features/agent/calendar/calendarEventDisambiguation';
import {
  logCalendarActionConfirmationReceived,
  logCalendarActionPendingCreated,
} from '@/src/features/agent/calendar/calendarActionReliabilityLogger';
import type {
  PendingCalendarDeleteContext,
  PendingCalendarUpdateContext,
} from '@/src/features/agent/execution/calendarExecutionSession';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';

function selectedCandidate(
  context: PendingCalendarDeleteContext | PendingCalendarUpdateContext,
  selectedEventId: string,
): CalendarDisambiguationCandidate | null {
  return context.candidates?.find((candidate) => candidate.eventId === selectedEventId) ?? null;
}

function mergePendingActionWithSelectedEvent(params: {
  pendingAction: CalendarPendingAction | null;
  selected: CalendarDisambiguationCandidate;
  targetStartTime?: string | null;
  targetEndTime?: string | null;
}): CalendarPendingAction | null {
  if (!params.pendingAction) {
    return null;
  }

  return {
    ...params.pendingAction,
    candidateEventId: params.selected.eventId,
    targetEventId: params.selected.eventId,
    updateEventId: params.pendingAction.actionType === 'update' ? params.selected.eventId : params.pendingAction.updateEventId,
    eventTitle: params.selected.title,
    targetEventTitle: params.selected.title,
    originalStart: params.selected.startsAt,
    originalEnd: params.selected.endsAt,
    updateFromStartISO: params.selected.startsAt,
    updateFromEndISO: params.selected.endsAt,
    requestedNewStart: params.targetStartTime ?? params.pendingAction.requestedNewStart ?? null,
    requestedNewEnd: params.targetEndTime ?? params.pendingAction.requestedNewEnd ?? null,
    updateToStartISO: params.targetStartTime ?? params.pendingAction.updateToStartISO ?? null,
  };
}

export function logPendingDeleteActionCreated(context: PendingCalendarDeleteContext) {
  logCalendarActionPendingCreated({
    type: 'delete',
    title: context.title,
    candidateCount: context.candidates?.length ?? 0,
    sourceTranscriptPreview: context.sourceTranscript,
  });
}

export function logPendingMoveActionCreated(context: PendingCalendarUpdateContext) {
  logCalendarActionPendingCreated({
    type: 'move',
    title: context.title,
    candidateCount: context.candidates?.length ?? 0,
    targetStartTime: context.toStartISO,
    sourceTranscriptPreview: context.sourceTranscript,
  });
}

export function bindPendingCalendarDeleteSelection(params: {
  context: PendingCalendarDeleteContext;
  selectedEventId: string;
  replyPreview: string;
  languageCode?: VoiceLanguageCode;
}) {
  const selected = selectedCandidate(params.context, params.selectedEventId);

  if (!selected) {
    return;
  }

  logCalendarActionConfirmationReceived({
    type: 'delete',
    eventId: selected.eventId,
    title: selected.title,
    startTime: selected.startsAt,
    endTime: selected.endsAt,
    replyPreview: params.replyPreview,
  });

  const snapshot = getCalendarConversationSnapshot();
  const pendingAction = mergePendingActionWithSelectedEvent({
    pendingAction: snapshot.pendingAction,
    selected,
  });

  if (!pendingAction) {
    return;
  }

  transitionCalendarConversationState({
    toState: snapshot.state === 'IDLE' ? 'WAITING_EVENT_SELECTION' : snapshot.state,
    pendingAction,
    reason: 'delete_selection_bound',
  });
}

export function bindPendingCalendarMoveSelection(params: {
  context: PendingCalendarUpdateContext;
  selectedEventId: string;
  replyPreview: string;
}) {
  const selected = selectedCandidate(params.context, params.selectedEventId);

  if (!selected) {
    return;
  }

  logCalendarActionConfirmationReceived({
    type: 'move',
    eventId: selected.eventId,
    title: selected.title,
    startTime: selected.startsAt,
    endTime: selected.endsAt,
    targetStartTime: params.context.toStartISO,
    replyPreview: params.replyPreview,
  });

  const snapshot = getCalendarConversationSnapshot();
  const pendingAction = mergePendingActionWithSelectedEvent({
    pendingAction: snapshot.pendingAction,
    selected,
    targetStartTime: params.context.toStartISO,
  });

  if (!pendingAction) {
    return;
  }

  transitionCalendarConversationState({
    toState: snapshot.state === 'IDLE' ? 'WAITING_EVENT_SELECTION' : snapshot.state,
    pendingAction,
    reason: 'move_selection_bound',
  });
}
