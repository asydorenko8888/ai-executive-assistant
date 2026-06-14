type CalendarActionKind = 'delete' | 'move' | 'update';

function logMarker(marker: string, payload: Record<string, unknown>) {
  console.log(marker);
  console.log(JSON.stringify(payload));
}

export function logCalendarActionPendingCreated(params: {
  type: CalendarActionKind;
  eventId?: string | null;
  title?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  targetStartTime?: string | null;
  targetEndTime?: string | null;
  candidateCount?: number;
  sourceTranscriptPreview?: string;
}) {
  logMarker('CALENDAR_ACTION_PENDING_CREATED', {
    type: params.type,
    eventId: params.eventId ?? null,
    title: params.title ?? null,
    startTime: params.startTime ?? null,
    endTime: params.endTime ?? null,
    targetStartTime: params.targetStartTime ?? null,
    targetEndTime: params.targetEndTime ?? null,
    candidateCount: params.candidateCount ?? 0,
    sourceTranscriptPreview: params.sourceTranscriptPreview?.slice(0, 160) ?? null,
  });
}

export function logCalendarActionConfirmationReceived(params: {
  type: CalendarActionKind;
  eventId: string;
  title: string;
  startTime: string;
  endTime: string;
  targetStartTime?: string | null;
  targetEndTime?: string | null;
  replyPreview: string;
}) {
  logMarker('CALENDAR_ACTION_CONFIRMATION_RECEIVED', {
    type: params.type,
    eventId: params.eventId,
    title: params.title,
    startTime: params.startTime,
    endTime: params.endTime,
    targetStartTime: params.targetStartTime ?? null,
    targetEndTime: params.targetEndTime ?? null,
    replyPreview: params.replyPreview.slice(0, 160),
  });
}

export function logCalendarDeleteApiCalled(eventId: string) {
  logMarker('CALENDAR_DELETE_API_CALLED', { eventId });
}

export function logCalendarDeleteApiSuccess(eventId: string) {
  logMarker('CALENDAR_DELETE_API_SUCCESS', { eventId });
}

export function logCalendarDeleteApiFailed(params: {
  eventId: string;
  errorCode?: string | null;
  message?: string | null;
}) {
  logMarker('CALENDAR_DELETE_API_FAILED', {
    eventId: params.eventId,
    errorCode: params.errorCode ?? null,
    message: params.message?.slice(0, 160) ?? null,
  });
}

export function logCalendarDeleteVerified(eventId: string) {
  logMarker('CALENDAR_DELETE_VERIFIED', { eventId });
}

export function logCalendarDeleteVerificationFailed(params: {
  eventId: string;
  reason: string;
}) {
  logMarker('CALENDAR_DELETE_VERIFICATION_FAILED', {
    eventId: params.eventId,
    reason: params.reason,
  });
}

export function logCalendarMoveApiCalled(params: {
  eventId: string;
  targetStartTime?: string | null;
  targetEndTime?: string | null;
}) {
  logMarker('CALENDAR_MOVE_API_CALLED', {
    eventId: params.eventId,
    targetStartTime: params.targetStartTime ?? null,
    targetEndTime: params.targetEndTime ?? null,
  });
}

export function logCalendarMoveApiSuccess(eventId: string) {
  logMarker('CALENDAR_MOVE_API_SUCCESS', { eventId });
}

export function logCalendarMoveApiFailed(params: {
  eventId: string;
  errorCode?: string | null;
  message?: string | null;
}) {
  logMarker('CALENDAR_MOVE_API_FAILED', {
    eventId: params.eventId,
    errorCode: params.errorCode ?? null,
    message: params.message?.slice(0, 160) ?? null,
  });
}

export function logCalendarMoveVerified(eventId: string) {
  logMarker('CALENDAR_MOVE_VERIFIED', { eventId });
}

export function logCalendarMoveVerificationFailed(params: {
  eventId: string;
  reason: string;
}) {
  logMarker('CALENDAR_MOVE_VERIFICATION_FAILED', {
    eventId: params.eventId,
    reason: params.reason,
  });
}
