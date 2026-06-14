import { devConsoleLog } from '@/src/shared/logging/devConsoleLog';

type CalendarActionKind = 'delete' | 'move' | 'update';

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
  devConsoleLog('CALENDAR_ACTION_PENDING_CREATED', {
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
  devConsoleLog('CALENDAR_ACTION_CONFIRMATION_RECEIVED', {
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
  devConsoleLog('CALENDAR_DELETE_API_CALLED', { eventId });
}

export function logCalendarDeleteApiSuccess(eventId: string) {
  devConsoleLog('CALENDAR_DELETE_API_SUCCESS', { eventId });
}

export function logCalendarDeleteApiFailed(params: {
  eventId: string;
  errorCode?: string | null;
  message?: string | null;
}) {
  devConsoleLog('CALENDAR_DELETE_API_FAILED', {
    eventId: params.eventId,
    errorCode: params.errorCode ?? null,
    message: params.message?.slice(0, 160) ?? null,
  });
}

export function logCalendarDeleteVerified(eventId: string) {
  devConsoleLog('CALENDAR_DELETE_VERIFIED', { eventId });
}

export function logCalendarDeleteVerificationFailed(params: {
  eventId: string;
  reason: string;
}) {
  devConsoleLog('CALENDAR_DELETE_VERIFICATION_FAILED', {
    eventId: params.eventId,
    reason: params.reason,
  });
}

export function logCalendarMoveApiCalled(params: {
  eventId: string;
  targetStartTime?: string | null;
  targetEndTime?: string | null;
}) {
  devConsoleLog('CALENDAR_MOVE_API_CALLED', {
    eventId: params.eventId,
    targetStartTime: params.targetStartTime ?? null,
    targetEndTime: params.targetEndTime ?? null,
  });
}

export function logCalendarMoveApiSuccess(eventId: string) {
  devConsoleLog('CALENDAR_MOVE_API_SUCCESS', { eventId });
}

export function logCalendarMoveApiFailed(params: {
  eventId: string;
  errorCode?: string | null;
  message?: string | null;
}) {
  devConsoleLog('CALENDAR_MOVE_API_FAILED', {
    eventId: params.eventId,
    errorCode: params.errorCode ?? null,
    message: params.message?.slice(0, 160) ?? null,
  });
}

export function logCalendarMoveVerified(eventId: string) {
  devConsoleLog('CALENDAR_MOVE_VERIFIED', { eventId });
}

export function logCalendarMoveVerificationFailed(params: {
  eventId: string;
  reason: string;
}) {
  devConsoleLog('CALENDAR_MOVE_VERIFICATION_FAILED', {
    eventId: params.eventId,
    reason: params.reason,
  });
}
