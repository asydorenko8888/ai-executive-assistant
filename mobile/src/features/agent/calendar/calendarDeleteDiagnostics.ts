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
