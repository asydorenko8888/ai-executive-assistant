import {
  buildCalendarPendingAction,
  mapOperationToPendingActionKind,
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
  conflicts?: Array<{
    event: { id: string; title: string; startsAt: string; endsAt: string };
  }>,
): CalendarPendingAction {
  const conflictEvents =
    conflicts?.map((entry) => ({
      eventId: entry.event.id,
      title: entry.event.title,
      startsAt: entry.event.startsAt,
      endsAt: entry.event.endsAt,
    })) ?? [
      {
        eventId: context.conflictingEventId,
        title: context.conflictingTitle,
        startsAt: context.conflictingStartsAt,
        endsAt: context.conflictingEndsAt,
      },
    ];

  return buildCalendarPendingAction({
    actionType: mapOperationToPendingActionKind(context.operation),
    originalIntent: context.sourceTranscript,
    eventTitle: context.proposedTitle,
    sourceTranscript: context.sourceTranscript,
    titleSourceTranscript: context.titleSourceTranscript,
    languageCode: context.languageCode,
    proposedStartMs: context.proposedStartMs,
    proposedEndMs: context.proposedEndMs,
    candidateEventId: context.updateEventId,
    updateEventId: context.updateEventId,
    conflictEvents,
    conflictingEventId: context.conflictingEventId,
    conflictingTitle: context.conflictingTitle,
    conflictingStartsAt: context.conflictingStartsAt,
    conflictingEndsAt: context.conflictingEndsAt,
    proceedDespiteConflict: context.proceedDespiteConflict,
  });
}

function deleteContextToPendingAction(
  context: PendingCalendarDeleteContext,
  languageCode: CalendarPendingAction['languageCode'],
): CalendarPendingAction {
  return buildCalendarPendingAction({
    actionType: 'delete',
    originalIntent: context.sourceTranscript,
    eventTitle: context.title?.trim() || 'event',
    sourceTranscript: context.sourceTranscript,
    languageCode,
    proposedStartMs: 0,
    proposedEndMs: 0,
    deleteTitleQuery: context.title,
  });
}

function updateContextToPendingAction(
  context: PendingCalendarUpdateContext,
  languageCode: CalendarPendingAction['languageCode'],
): CalendarPendingAction {
  return buildCalendarPendingAction({
    actionType: 'update',
    originalIntent: context.sourceTranscript,
    eventTitle: context.title?.trim() || 'event',
    sourceTranscript: context.sourceTranscript,
    languageCode,
    proposedStartMs: 0,
    proposedEndMs: 0,
    updateFromTime: context.fromTime,
    updateToTime: context.toTime,
  });
}

export function syncConversationStateForConflict(
  context: PendingCalendarConflictContext,
  toState: CalendarConversationState = 'WAITING_CONFLICT_CONFIRMATION',
  conflicts?: Array<{
    event: { id: string; title: string; startsAt: string; endsAt: string };
    startsAtMs: number;
    endsAtMs: number;
  }>,
) {
  transitionCalendarConversationState({
    toState,
    pendingAction: conflictContextToPendingAction(context, conflicts),
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
