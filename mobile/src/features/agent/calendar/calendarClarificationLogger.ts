import type { CalendarDisambiguationCandidate } from '@/src/features/agent/calendar/calendarEventDisambiguation';
import { devConsoleLog } from '@/src/shared/logging/devConsoleLog';

export function logClarificationStarted(params: {
  kind: 'move_event' | 'delete_event';
  sourceTranscript: string;
  title?: string | null;
  pendingActionId?: string | null;
}) {
  devConsoleLog('CLARIFICATION_STARTED', {
    kind: params.kind,
    title: params.title ?? null,
    pendingActionId: params.pendingActionId ?? null,
    sourceTranscriptPreview: params.sourceTranscript.slice(0, 160),
  });
}

export function logClarificationCandidates(params: {
  kind: 'move_event' | 'delete_event';
  candidates: CalendarDisambiguationCandidate[];
}) {
  devConsoleLog('CLARIFICATION_CANDIDATES', {
    kind: params.kind,
    candidateCount: params.candidates.length,
    candidates: params.candidates.map((candidate) => ({
      eventId: candidate.eventId,
      title: candidate.title,
      startsAt: candidate.startsAt,
    })),
  });
}

export function logClarificationResolved(params: {
  kind: 'move_event' | 'delete_event';
  replyPreview: string;
  selectedEventId: string;
  sourceTranscriptPreview: string;
}) {
  devConsoleLog('CLARIFICATION_RESOLVED', {
    kind: params.kind,
    replyPreview: params.replyPreview,
    selectedEventId: params.selectedEventId,
    sourceTranscriptPreview: params.sourceTranscriptPreview,
  });
}

export function logClarificationSelectedEvent(params: {
  kind: 'move_event' | 'delete_event';
  eventId: string;
  title: string;
  startsAt: string;
  toStartISO?: string | null;
}) {
  devConsoleLog('CLARIFICATION_SELECTED_EVENT', {
    kind: params.kind,
    eventId: params.eventId,
    title: params.title,
    startsAt: params.startsAt,
    toStartISO: params.toStartISO ?? null,
  });
}
