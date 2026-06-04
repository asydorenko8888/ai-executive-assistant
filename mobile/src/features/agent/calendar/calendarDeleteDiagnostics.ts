export function logDeleteParsedRequest(payload: {
  transcript: string;
  titleQuery: string;
  hasExplicitTime: boolean;
  clockMinutes: number | null;
}) {
  console.log('[DELETE Parsed Request]', payload);
}

export function logDeleteEventList(payload: { count: number; eventIds: string[] }) {
  console.log('[DELETE Event List]', payload);
}

export function logDeleteCandidate(payload: {
  count: number;
  candidates: Array<{ id: string; title: string; startsAt: string }>;
}) {
  console.log('[DELETE Candidate]', payload);
}

export function logDeleteSelectedEvent(payload: {
  id: string;
  title: string;
  startsAt: string;
} | null) {
  console.log('[DELETE Selected Event]', payload);
}

export function logDeleteNotFoundReason(payload: {
  reason: string;
  titleQuery: string;
  clockMinutes: number | null;
  candidateCount: number;
}) {
  console.log('[DELETE Not Found Reason]', payload);
}

export function logDeleteBackendResponse(payload: {
  eventId: string;
  verified: boolean;
  verificationFetched: boolean;
  status: string;
}) {
  console.log('[DELETE Backend Response]', payload);
}

export function logDeleteVerificationResult(payload: { verified: boolean; eventId: string }) {
  console.log('[DELETE Verification Result]', payload);
}

export function logDeleteDisambiguationCandidates(payload: {
  phase: string;
  candidates: Array<{ eventId: string; title: string; startsAt: string }>;
  replyPreview?: string;
}) {
  console.log('[DELETE Disambiguation Candidates]', {
    phase: payload.phase,
    count: payload.candidates.length,
    replyPreview: payload.replyPreview ?? null,
    candidates: payload.candidates.map((candidate, index) => ({
      option: index + 1,
      eventId: candidate.eventId,
      title: candidate.title,
      startsAt: candidate.startsAt,
    })),
  });
}

export function logDeleteDisambiguationSelection(payload: {
  phase: string;
  replyPreview: string;
  selectedEventId: string;
  selectedTitle: string;
  selectedStartsAt: string;
}) {
  console.log('[DELETE Disambiguation Selection]', payload);
}

export function logDeleteExecutionEventId(payload: {
  phase: string;
  eventId: string | null | undefined;
  transcriptPreview: string;
  source: 'selectedEventId_param' | 'pending_context' | 'resolution';
}) {
  console.log('[DELETE Execution eventId]', payload);
}

export function logPendingDeleteCreated(payload: {
  originalUserText: string;
  title: string | null;
  candidateCount: number;
}) {
  console.log('[pending_delete_created]', payload);
}

export function logPendingDeleteCandidates(payload: {
  candidates: Array<{ eventId: string; title: string; startsAt: string }>;
}) {
  console.log('[pending_delete_candidates]', {
    count: payload.candidates.length,
    candidates: payload.candidates.map((candidate, index) => ({
      option: index + 1,
      eventId: candidate.eventId,
      title: candidate.title,
      startsAt: candidate.startsAt,
    })),
  });
}

export function logPendingDeleteUserReply(payload: { replyPreview: string }) {
  console.log('[pending_delete_user_reply]', payload);
}

export function logPendingDeleteSelectedCandidate(payload: {
  eventId: string;
  title: string;
  startsAt: string;
  replyPreview: string;
}) {
  console.log('[pending_delete_selected_candidate]', payload);
}

export function logPendingDeleteEventIdBeforeApi(payload: {
  eventId: string | null | undefined;
  calendarId?: string | null;
  transcriptPreview: string;
}) {
  console.log('[pending_delete_event_id_before_api]', payload);
}

export function logDeleteApiResult(payload: {
  eventId: string | null;
  status: string;
  verified: boolean;
  errorCode?: string | null;
  errorMessage?: string | null;
}) {
  console.log('[delete_api_result]', payload);
}
