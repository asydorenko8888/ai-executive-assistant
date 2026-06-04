import {
  logPendingDeleteCandidates,
  logPendingDeleteCreated,
  logPendingDeleteSelectedCandidate,
  logPendingDeleteUserReply,
} from '@/src/features/agent/calendar/calendarDeleteDiagnostics';
import { refreshPendingDeleteCandidates } from '@/src/features/agent/calendar/refreshPendingDeleteCandidates';
import {
  resolveDisambiguationSelection,
  type CalendarDisambiguationCandidate,
} from '@/src/features/agent/calendar/calendarEventDisambiguation';
import type { PendingCalendarDeleteContext } from '@/src/features/agent/execution/calendarExecutionSession';

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

  if (!reply || !params.pending.candidates?.length) {
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

  const context: PendingCalendarDeleteContext = {
    ...params.pending,
    candidates: refreshedCandidates,
    selectedEventId: selected.eventId,
    dayHint: null,
  };

  return { context, selected };
}
