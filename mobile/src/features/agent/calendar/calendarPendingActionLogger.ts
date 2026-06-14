type PendingActionType = 'delete_event' | 'move_event' | 'update_event';

function logMarker(marker: string, payload: Record<string, unknown>) {
  console.log(marker);
  console.log(JSON.stringify(payload));
}

export function logPendingActionCreated(params: {
  type: PendingActionType;
  sourceTranscript: string;
  title?: string | null;
  candidateCount: number;
  candidateEventIds: string[];
  pendingActionId?: string | null;
}) {
  logMarker('PENDING_ACTION_CREATED', {
    type: params.type,
    title: params.title ?? null,
    candidateCount: params.candidateCount,
    candidateEventIds: params.candidateEventIds,
    pendingActionId: params.pendingActionId ?? null,
    sourceTranscriptPreview: params.sourceTranscript.slice(0, 160),
  });
}

export function logPendingActionMatched(params: {
  type: PendingActionType;
  replyPreview: string;
  selectedEventId: string;
  selectedTitle: string;
  selectedStartsAt: string;
  pendingActionId?: string | null;
}) {
  logMarker('PENDING_ACTION_MATCHED', {
    type: params.type,
    selectedEventId: params.selectedEventId,
    selectedTitle: params.selectedTitle,
    selectedStartsAt: params.selectedStartsAt,
    pendingActionId: params.pendingActionId ?? null,
    replyPreview: params.replyPreview.slice(0, 160),
  });
}

export function logPendingActionResolved(params: {
  type: PendingActionType;
  selectedEventId: string;
  sourceTranscriptPreview: string;
  pendingActionId?: string | null;
}) {
  logMarker('PENDING_ACTION_RESOLVED', {
    type: params.type,
    selectedEventId: params.selectedEventId,
    pendingActionId: params.pendingActionId ?? null,
    sourceTranscriptPreview: params.sourceTranscriptPreview.slice(0, 160),
  });
}

export function logPendingActionCleared(params: {
  type?: PendingActionType | null;
  reason: string;
  pendingActionId?: string | null;
}) {
  logMarker('PENDING_ACTION_CLEARED', {
    type: params.type ?? null,
    reason: params.reason,
    pendingActionId: params.pendingActionId ?? null,
  });
}
