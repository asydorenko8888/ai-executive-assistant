import {
  mapOperationToPendingActionType,
  pendingActionToIso,
  transitionCalendarConversationState,
  type CalendarConversationState,
  type CalendarPendingAction,
} from '@/src/features/agent/calendar/calendarConversationState';
import type {
  PendingCalendarConflictContext,
  PendingCalendarDeleteContext,
  PendingCalendarUpdateContext,
} from '@/src/features/agent/execution/calendarExecutionSession';

function conflictContextToPendingAction(
  context: PendingCalendarConflictContext,
): CalendarPendingAction {
  return {
    action: mapOperationToPendingActionType(context.operation),
    eventTitle: context.proposedTitle,
    sourceTranscript: context.sourceTranscript,
    titleSourceTranscript: context.titleSourceTranscript,
    languageCode: context.languageCode,
    requestedStartMs: context.proposedStartMs,
    requestedEndMs: context.proposedEndMs,
    requestedTimeIso: pendingActionToIso(context.proposedStartMs),
    updateEventId: context.updateEventId,
    conflictingEventId: context.conflictingEventId,
    conflictingTitle: context.conflictingTitle,
    conflictingStartsAt: context.conflictingStartsAt,
    conflictingEndsAt: context.conflictingEndsAt,
    proceedDespiteConflict: context.proceedDespiteConflict,
  };
}

function deleteContextToPendingAction(
  context: PendingCalendarDeleteContext,
  languageCode: CalendarPendingAction['languageCode'],
): CalendarPendingAction {
  return {
    action: 'DELETE_EVENT',
    eventTitle: context.title?.trim() || 'event',
    sourceTranscript: context.sourceTranscript,
    titleSourceTranscript: null,
    languageCode,
    requestedStartMs: 0,
    requestedEndMs: 0,
    requestedTimeIso: pendingActionToIso(0),
    deleteTitleQuery: context.title,
  };
}

function updateContextToPendingAction(
  context: PendingCalendarUpdateContext,
  languageCode: CalendarPendingAction['languageCode'],
): CalendarPendingAction {
  return {
    action: 'UPDATE_EVENT',
    eventTitle: context.title?.trim() || 'event',
    sourceTranscript: context.sourceTranscript,
    titleSourceTranscript: null,
    languageCode,
    requestedStartMs: 0,
    requestedEndMs: 0,
    requestedTimeIso: pendingActionToIso(0),
    updateFromTime: context.fromTime,
    updateToTime: context.toTime,
  };
}

export function syncConversationStateForConflict(
  context: PendingCalendarConflictContext,
  toState: CalendarConversationState = 'WAITING_CONFLICT_CONFIRMATION',
) {
  transitionCalendarConversationState({
    toState,
    pendingAction: conflictContextToPendingAction(context),
    reason: 'schedule_conflict_detected',
  });
}

export function syncConversationStateForConflictAlternatives(
  context: PendingCalendarConflictContext,
  alternativeStartMs: number[],
) {
  transitionCalendarConversationState({
    toState: 'WAITING_NEW_TIME',
    pendingAction: {
      ...conflictContextToPendingAction(context),
      alternativeStartMs,
    },
    reason: 'conflict_alternatives_offered',
  });
}

export function syncConversationStateForDeleteSelection(
  context: PendingCalendarDeleteContext,
  languageCode: CalendarPendingAction['languageCode'],
) {
  transitionCalendarConversationState({
    toState: 'WAITING_EVENT_SELECTION',
    pendingAction: deleteContextToPendingAction(context, languageCode),
    reason: 'delete_event_ambiguous',
  });
}

export function syncConversationStateForMoveClarification(
  context: PendingCalendarUpdateContext,
  languageCode: CalendarPendingAction['languageCode'],
) {
  transitionCalendarConversationState({
    toState: 'WAITING_MOVE_CONFIRMATION',
    pendingAction: updateContextToPendingAction(context, languageCode),
    reason: 'update_move_clarification',
  });
}

export function syncConversationStateForUpdateSelection(
  context: PendingCalendarUpdateContext,
  languageCode: CalendarPendingAction['languageCode'],
) {
  transitionCalendarConversationState({
    toState: 'WAITING_EVENT_SELECTION',
    pendingAction: updateContextToPendingAction(context, languageCode),
    reason: 'update_event_ambiguous',
  });
}
