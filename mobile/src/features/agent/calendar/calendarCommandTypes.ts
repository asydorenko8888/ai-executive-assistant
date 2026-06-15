import {
  isAwaitingCalendarConflictResolution,
  isCalendarConversationAwaitingInput,
} from '@/src/features/agent/calendar/calendarConversationState';
import { resolveMoveEventReference } from '@/src/features/agent/calendar/calendarConversationEventMemory';
import { transcriptHasEventPronounReference } from '@/src/features/agent/calendar/calendarEventReferenceTokens';
import { isNewCalendarCommandMessage } from '@/src/features/agent/calendar/calendarPendingReplyClassifier';
import { isBareCalendarShortReply } from '@/src/features/agent/calendar/calendarShortReply';
import { RELATIVE_SHIFT_HINT } from '@/src/features/agent/calendar/calendarUpdateVerbs';
import {
  getPendingCalendarConflictContext,
  getPendingCalendarDeleteContext,
  getPendingCalendarUpdateContext,
} from '@/src/features/agent/execution/calendarExecutionSession';
import { isCalendarReadOnlyQuery } from '@/src/features/agent/calendar/calendarReadOnlyQuery';
import {
  isOperationalCalendarCreateRequest,
  isOperationalCalendarDeleteRequest,
  isOperationalCalendarUpdateRequest,
  isOperationalCalendarWriteRequest,
} from '@/src/features/agent/intent/operationalCalendarWriteDetection';
import { isPostActionAcknowledgmentTurn } from '@/src/features/agent/conversation/postActionAcknowledgmentReply';
import {
  containsLocalAlarmDomain,
  containsLocalAlarmKeyword,
  isLocalAlarmIntent,
} from '@/src/features/local-alarms/localAlarmClassification';

export type CalendarCommandKind =
  | 'create_calendar_event'
  | 'delete_calendar_event'
  | 'update_calendar_event'
  | 'none';

export function detectCalendarCommandIntent(transcript: string): CalendarCommandKind {
  const normalized = transcript.trim();

  if (!normalized || isLocalAlarmIntent(normalized) || containsLocalAlarmDomain(normalized)) {
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

function isConversationMemoryFollowUp(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized) {
    return false;
  }

  const memoryRef = resolveMoveEventReference(new Date());

  if (!memoryRef) {
    return false;
  }

  return transcriptHasEventPronounReference(normalized) || RELATIVE_SHIFT_HINT.test(normalized);
}

export function requiresCalendarCommandExecution(transcript: string) {
  const normalized = transcript.trim();

  if (isPostActionAcknowledgmentTurn({ transcript: normalized })) {
    return false;
  }

  if (
    isCalendarConversationAwaitingInput() ||
    isAwaitingCalendarConflictResolution() ||
    isBareCalendarShortReply(normalized) ||
    isNewCalendarCommandMessage(normalized) ||
    getPendingCalendarUpdateContext() ||
    getPendingCalendarDeleteContext() ||
    getPendingCalendarConflictContext()
  ) {
    return true;
  }

  if (isCalendarReadOnlyQuery(normalized)) {
    return false;
  }

  if (isConversationMemoryFollowUp(normalized)) {
    return true;
  }

  return isOperationalCalendarWriteRequest(normalized);
}

export function isCalendarCommandIntent(kind: CalendarCommandKind) {
  return (
    kind === 'create_calendar_event' ||
    kind === 'delete_calendar_event' ||
    kind === 'update_calendar_event'
  );
}
