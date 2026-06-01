import { isCalendarConversationAwaitingInput } from '@/src/features/agent/calendar/calendarConversationState';
import { isNewCalendarCommandMessage } from '@/src/features/agent/calendar/calendarPendingReplyClassifier';
import { isBareCalendarShortReply } from '@/src/features/agent/calendar/calendarShortReply';
import {
  getPendingCalendarConflictContext,
  getPendingCalendarDeleteContext,
  getPendingCalendarUpdateContext,
} from '@/src/features/agent/execution/calendarExecutionSession';
import {
  isOperationalCalendarCreateRequest,
  isOperationalCalendarDeleteRequest,
  isOperationalCalendarUpdateRequest,
  isOperationalCalendarWriteRequest,
} from '@/src/features/agent/intent/operationalCalendarWriteDetection';

export type CalendarCommandKind =
  | 'create_calendar_event'
  | 'delete_calendar_event'
  | 'update_calendar_event'
  | 'none';

export function detectCalendarCommandIntent(transcript: string): CalendarCommandKind {
  const normalized = transcript.trim();

  if (!normalized) {
    return 'none';
  }

  if (isOperationalCalendarDeleteRequest(normalized)) {
    return 'delete_calendar_event';
  }

  if (isOperationalCalendarUpdateRequest(normalized)) {
    return 'update_calendar_event';
  }

  if (isOperationalCalendarCreateRequest(normalized)) {
    return 'create_calendar_event';
  }

  return 'none';
}

export function requiresCalendarCommandExecution(transcript: string) {
  if (
    isCalendarConversationAwaitingInput() ||
    isBareCalendarShortReply(transcript) ||
    isNewCalendarCommandMessage(transcript) ||
    getPendingCalendarUpdateContext() ||
    getPendingCalendarDeleteContext() ||
    getPendingCalendarConflictContext()
  ) {
    return true;
  }

  return isOperationalCalendarWriteRequest(transcript.trim());
}

export function isCalendarCommandIntent(kind: CalendarCommandKind) {
  return (
    kind === 'create_calendar_event' ||
    kind === 'delete_calendar_event' ||
    kind === 'update_calendar_event'
  );
}
