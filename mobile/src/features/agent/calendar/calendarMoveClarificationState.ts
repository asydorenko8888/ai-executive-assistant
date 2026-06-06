import {
  logClarificationCandidates,
  logClarificationResolved,
  logClarificationSelectedEvent,
  logClarificationStarted,
} from '@/src/features/agent/calendar/calendarClarificationLogger';
import { touchCalendarConversationContext } from '@/src/features/agent/calendar/calendarConversationContext';
import type { CalendarPendingConflictEvent } from '@/src/features/agent/calendar/calendarConversationStore';
import {
  getCalendarConversationSnapshot,
  type CalendarPendingAction,
} from '@/src/features/agent/calendar/calendarConversationState';
import { isCalendarMoveUpdateSelectionState } from '@/src/features/agent/calendar/calendarMoveUpdateLifecycle';
import type { CalendarDisambiguationCandidate } from '@/src/features/agent/calendar/calendarEventDisambiguation';
import {
  pendingContextFromExtraction,
  resolvePendingUpdateTargetStartISO,
  tryMergePendingCalendarUpdateReply,
} from '@/src/features/agent/calendar/calendarUpdatePendingContext';
import { extractCalendarUpdateParameters } from '@/src/features/agent/calendar/calendarUpdateIntentExtractor';
import {
  getPendingCalendarUpdateContext,
  setPendingCalendarUpdateContext,
  type PendingCalendarUpdateContext,
} from '@/src/features/agent/execution/calendarExecutionSession';

export type MoveClarificationKind = 'move_event' | 'delete_event';

export function conflictEventsToDisambiguationCandidates(
  events: CalendarPendingConflictEvent[],
): CalendarDisambiguationCandidate[] {
  return events.map((event) => ({
    eventId: event.eventId,
    title: event.title,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
  }));
}

export function isAwaitingMoveEventClarification() {
  const snapshot = getCalendarConversationSnapshot();

  return (
    isCalendarMoveUpdateSelectionState(snapshot.state) &&
    getStoredMoveClarificationCandidates().length > 0
  );
}

export function getStoredMoveClarificationCandidates(): CalendarDisambiguationCandidate[] {
  const updatePending = getPendingCalendarUpdateContext();

  if (updatePending?.candidates?.length) {
    return updatePending.candidates;
  }

  const pendingAction = getCalendarConversationSnapshot().pendingAction;

  if (pendingAction?.clarificationKind === 'move_event' && pendingAction.selectionCandidates?.length) {
    return conflictEventsToDisambiguationCandidates(pendingAction.selectionCandidates);
  }

  if (
    pendingAction?.actionType === 'update' &&
    isCalendarMoveUpdateSelectionState(getCalendarConversationSnapshot().state) &&
    pendingAction.conflictEvents.length > 0
  ) {
    return conflictEventsToDisambiguationCandidates(pendingAction.conflictEvents);
  }

  return [];
}

export function buildPendingUpdateContextFromAction(
  pendingAction: CalendarPendingAction,
  candidates: CalendarDisambiguationCandidate[],
  referenceNow: Date,
): PendingCalendarUpdateContext {
  const extracted = extractCalendarUpdateParameters(pendingAction.sourceTranscript, referenceNow);

  return {
    ...pendingContextFromExtraction({
      sourceTranscript: pendingAction.sourceTranscript,
      extraction: extracted,
      candidates,
      referenceNow,
    }),
    title: pendingAction.eventTitle ?? extracted.title,
    fromStartISO: pendingAction.updateFromStartISO ?? extracted.fromStartISO,
    toStartISO: pendingAction.updateToStartISO ?? extracted.toStartISO,
  };
}

export function ensurePendingUpdateContextHydrated(referenceNow: Date) {
  const existing = getPendingCalendarUpdateContext();

  if (existing?.candidates?.length) {
    return existing;
  }

  const candidates = getStoredMoveClarificationCandidates();

  if (candidates.length === 0) {
    return null;
  }

  const pendingAction = getCalendarConversationSnapshot().pendingAction;

  if (!pendingAction || pendingAction.actionType !== 'update') {
    return null;
  }

  const hydrated = buildPendingUpdateContextFromAction(pendingAction, candidates, referenceNow);
  setPendingCalendarUpdateContext(hydrated);
  return hydrated;
}

export function recordMoveClarificationStarted(params: {
  pendingAction: CalendarPendingAction;
  candidates: CalendarDisambiguationCandidate[];
  sourceTranscript: string;
  title?: string | null;
}) {
  logClarificationStarted({
    kind: 'move_event',
    sourceTranscript: params.sourceTranscript,
    title: params.title,
    pendingActionId: params.pendingAction.pendingActionId,
  });
  logClarificationCandidates({
    kind: 'move_event',
    candidates: params.candidates,
  });
  touchCalendarConversationContext();
}

export function resolveStoredMoveClarificationReply(params: {
  reply: string;
  referenceNow: Date;
}) {
  const pending = ensurePendingUpdateContextHydrated(params.referenceNow);

  if (!pending?.candidates?.length) {
    return null;
  }

  const merged = tryMergePendingCalendarUpdateReply({
    pending,
    reply: params.reply,
    referenceNow: params.referenceNow,
  });

  if (!merged?.selectedEventId) {
    return null;
  }

  const selected = pending.candidates.find((candidate) => candidate.eventId === merged.selectedEventId) ?? null;

  logClarificationResolved({
    kind: 'move_event',
    replyPreview: params.reply.slice(0, 120),
    selectedEventId: merged.selectedEventId,
    sourceTranscriptPreview: pending.sourceTranscript.slice(0, 120),
  });

  if (selected) {
    logClarificationSelectedEvent({
      kind: 'move_event',
      eventId: selected.eventId,
      title: selected.title,
      startsAt: selected.startsAt,
      toStartISO: merged.context.toStartISO,
    });
  }

  setPendingCalendarUpdateContext(merged.context);

  return merged;
}

export function buildMoveClarificationPendingActionFields(
  candidates: CalendarDisambiguationCandidate[],
) {
  const selectionCandidates: CalendarPendingConflictEvent[] = candidates.map((candidate) => ({
    eventId: candidate.eventId,
    title: candidate.title,
    startsAt: candidate.startsAt,
    endsAt: candidate.endsAt,
  }));

  return {
    clarificationKind: 'move_event' as const,
    selectionCandidates,
    conflictEvents: selectionCandidates,
  };
}

export function resolveMoveTargetAfterClarification(params: {
  pending: PendingCalendarUpdateContext;
  selectedStartISO: string;
  referenceNow: Date;
}) {
  return resolvePendingUpdateTargetStartISO({
    pending: params.pending,
    selectedStartISO: params.selectedStartISO,
    referenceNow: params.referenceNow,
  });
}
