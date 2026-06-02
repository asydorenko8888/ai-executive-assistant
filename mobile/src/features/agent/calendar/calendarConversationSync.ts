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
import { setPendingEventFromAction } from '@/src/features/agent/calendar/calendarConversationEventMemory';
import { setPendingIntentFromAction } from '@/src/features/agent/calendar/calendarPendingIntent';

function persistPendingEventAsActiveContext(pending: CalendarPendingAction) {
  setPendingEventFromAction(pending);
  setPendingIntentFromAction(pending);
}

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
  const toMs = context.toStartISO ? Date.parse(context.toStartISO) : 0;
  const fromMs = context.fromStartISO ? Date.parse(context.fromStartISO) : 0;
  const proposedStartMs = Number.isNaN(toMs) || toMs <= 0 ? fromMs : toMs;
  const proposedEndMs =
    proposedStartMs > 0 && !Number.isNaN(proposedStartMs) ? proposedStartMs + 60 * 60_000 : 0;

  return buildCalendarPendingAction({
    actionType: 'update',
    originalIntent: context.sourceTranscript,
    eventTitle: context.title?.trim() || 'event',
    sourceTranscript: context.sourceTranscript,
    languageCode,
    proposedStartMs: Number.isNaN(proposedStartMs) ? 0 : proposedStartMs,
    proposedEndMs: Number.isNaN(proposedEndMs) ? 0 : proposedEndMs,
    updateFromStartISO: context.fromStartISO,
    updateToStartISO: context.toStartISO,
  });
}

export function syncConversationStateForConflict(
  context: PendingCalendarConflictContext,
  toState: CalendarConversationState = 'WAITING_CONFLICT_DECISION',
  conflicts?: Array<{
    event: { id: string; title: string; startsAt: string; endsAt: string };
    startsAtMs: number;
    endsAtMs: number;
  }>,
) {
  const pendingAction = conflictContextToPendingAction(context, conflicts);

  transitionCalendarConversationState({
    toState,
    pendingAction,
    reason: 'schedule_conflict_detected',
  });
  persistPendingEventAsActiveContext(pendingAction);
}

export function syncConversationStateForConflictInitial(
  context: PendingCalendarConflictContext,
  conflicts?: Array<{
    event: { id: string; title: string; startsAt: string; endsAt: string };
    startsAtMs: number;
    endsAtMs: number;
  }>,
) {
  const pendingAction = conflictContextToPendingAction(context, conflicts);

  transitionCalendarConversationState({
    toState: 'WAITING_CONFLICT_DECISION',
    pendingAction,
    reason: 'schedule_conflict_yes_no_prompt',
  });
  persistPendingEventAsActiveContext(pendingAction);
}

export function syncConversationStateForConflictAlternatives(
  context: PendingCalendarConflictContext,
  alternativeStartMs: number[],
) {
  const pendingAction = {
    ...conflictContextToPendingAction(context),
    alternativeStartMs,
  };

  transitionCalendarConversationState({
    toState: 'WAITING_ALTERNATIVE_SLOT',
    pendingAction,
    reason: 'conflict_alternatives_offered',
  });
  persistPendingEventAsActiveContext(pendingAction);
}

export function syncConversationStateForDeleteSelection(
  context: PendingCalendarDeleteContext,
  languageCode: CalendarPendingAction['languageCode'],
) {
  const pendingAction = deleteContextToPendingAction(context, languageCode);

  transitionCalendarConversationState({
    toState: 'WAITING_EVENT_SELECTION',
    pendingAction,
    reason: 'delete_event_ambiguous',
  });
  persistPendingEventAsActiveContext(pendingAction);
}

export function syncConversationStateForMoveClarification(
  context: PendingCalendarUpdateContext,
  languageCode: CalendarPendingAction['languageCode'],
) {
  const pendingAction = updateContextToPendingAction(context, languageCode);

  transitionCalendarConversationState({
    toState: 'WAITING_MOVE_CONFIRMATION',
    pendingAction,
    reason: 'update_move_clarification',
  });
  persistPendingEventAsActiveContext(pendingAction);
}

export function syncConversationStateForUpdateSelection(
  context: PendingCalendarUpdateContext,
  languageCode: CalendarPendingAction['languageCode'],
) {
  const pendingAction = updateContextToPendingAction(context, languageCode);

  transitionCalendarConversationState({
    toState: 'WAITING_EVENT_SELECTION',
    pendingAction,
    reason: 'update_event_ambiguous',
  });
  persistPendingEventAsActiveContext(pendingAction);
}
