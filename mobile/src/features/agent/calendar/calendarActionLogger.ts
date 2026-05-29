export function logCalendarActionIntent(details: Record<string, unknown>) {
  console.log('[Calendar Action Intent]', details);
}

export function logCalendarMatchCandidates(details: Record<string, unknown>) {
  console.log('[Calendar Match Candidates]', details);
}

export function logCalendarApiRequest(details: Record<string, unknown>) {
  console.log('[Calendar API Request]', details);
}

export function logCalendarApiSuccess(details: Record<string, unknown>) {
  console.log('[Calendar API Success]', details);
}

export function logCalendarApiError(details: Record<string, unknown>) {
  console.log('[Calendar API Error]', details);
}

export function logCalendarFinalAnswer(details: Record<string, unknown>) {
  console.log('[Calendar Final Answer]', details);
}
