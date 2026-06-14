import {
  logPendingDeleteCandidates,
  logPendingDeleteCreated,
  logPendingDeleteSelectedCandidate,
  logPendingDeleteUserReply,
} from '@/src/features/agent/calendar/calendarDeleteDiagnostics';
import { logPendingActionCreated, logPendingActionMatched } from '@/src/features/agent/calendar/calendarPendingActionLogger';
import { bindPendingCalendarDeleteSelection } from '@/src/features/agent/calendar/calendarPendingActionBinding';
import { refreshPendingDeleteCandidates } from '@/src/features/agent/calendar/refreshPendingDeleteCandidates';
import {
  resolveDisambiguationSelection,
  type CalendarDisambiguationCandidate,
} from '@/src/features/agent/calendar/calendarEventDisambiguation';
import type { PendingCalendarDeleteContext } from '@/src/features/agent/execution/calendarExecutionSession';
import { tryMergePendingCalendarDeleteReply } from '@/src/features/agent/calendar/calendarDeletePendingContext';

export function createPendingCalendarDeleteContext(params: {
  sourceTranscript: string;
  titleQuery: string;
  candidates: CalendarDisambiguationCandidate[];
  deleteAll?: boolean;
}): PendingCalendarDeleteContext {
  const context: PendingCalendarDeleteContext = {
    operation: 'delete',
    type: 'delete',
    title: params.titleQuery.trim() || null,
    dayHint: null,
    sourceTranscript: params.sourceTranscript.trim(),
    originalUserText: params.sourceTranscript.trim(),
    createdAtMs: Date.now(),
    candidates: params.candidates,
    deleteAll: params.deleteAll ?? false,
  };

  logPendingDeleteCreated({
    originalUserText: context.originalUserText,
    title: context.title,
    candidateCount: context.candidates?.length ?? 0,
  });
  logPendingActionCreated({
    type: 'delete_event',
    sourceTranscript: context.sourceTranscript,
    title: context.title,
    candidateCount: context.candidates?.length ?? 0,
    candidateEventIds: context.candidates?.map((candidate) => candidate.eventId) ?? [],
  });
  logPendingDeleteCandidates({
    candidates: context.candidates ?? [],
  });

  return context;
}

export async function resolvePendingCalendarDeleteFromReply(params: {
  pending: PendingCalendarDeleteContext;
  reply: string;
  referenceNow: Date;
  timeZone?: string;
}): Promise<{
  context: PendingCalendarDeleteContext;
  selected: CalendarDisambiguationCandidate;
} | null> {
  const reply = params.reply.trim();

  if (!reply) {
    return null;
  }

  const merged = tryMergePendingCalendarDeleteReply({
    pending: params.pending,
    reply,
    referenceNow: params.referenceNow,
    timeZone: params.timeZone,
  });

  if (merged?.selectedEventId) {
    const selected = params.pending.candidates?.find((candidate) => candidate.eventId === merged.selectedEventId) ?? {
      eventId: merged.selectedEventId,
      title: merged.context.title ?? 'event',
      startsAt: merged.context.selectedEventId === merged.selectedEventId ? '' : '',
      endsAt: '',
    };

    return {
      context: merged.context,
      selected,
    };
  }

  if (!params.pending.candidates?.length) {
    return null;
  }

  logPendingDeleteUserReply({ replyPreview: reply.slice(0, 160) });

  const refreshedCandidates = await refreshPendingDeleteCandidates(params.pending.candidates);
  logPendingDeleteCandidates({ candidates: refreshedCandidates });

  const selected = resolveDisambiguationSelection({
    reply,
    candidates: refreshedCandidates,
    referenceNow: params.referenceNow,
    timeZone: params.timeZone,
    pendingTitle: params.pending.title,
  });

  if (!selected) {
    return null;
  }

  logPendingDeleteSelectedCandidate({
    eventId: selected.eventId,
    title: selected.title,
    startsAt: selected.startsAt,
    replyPreview: reply.slice(0, 120),
  });
  logPendingActionMatched({
    type: 'delete_event',
    replyPreview: reply,
    selectedEventId: selected.eventId,
    selectedTitle: selected.title,
    selectedStartsAt: selected.startsAt,
  });

  const context: PendingCalendarDeleteContext = {
    ...params.pending,
    candidates: refreshedCandidates,
    selectedEventId: selected.eventId,
    dayHint: null,
  };

  bindPendingCalendarDeleteSelection({
    context,
    selectedEventId: selected.eventId,
    replyPreview: reply,
  });

  return { context, selected };
}
