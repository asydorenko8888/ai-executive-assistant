export type CalendarMutationSelectionSource =
  | 'google_calendar_list'
  | 'conversation_context_hint'
  | 'none';

export function logCalendarMutationStart(payload: {
  intent: 'create_calendar_event' | 'update_calendar_event' | 'delete_calendar_event';
  originalCommand: string;
}) {
  console.log('[CALENDAR MUTATION]');
  console.log(`originalCommand=${payload.originalCommand}`);
  console.log(`detectedIntent=${payload.intent}`);
}

export function logCalendarMutationFreshRead(payload: {
  dayOffset: number;
  timeMin: string;
  timeMax: string;
  fetchOk: boolean;
  eventCount: number;
}) {
  console.log('[CALENDAR MUTATION] freshRead');
  console.log(`dayOffset=${payload.dayOffset}`);
  console.log(`timeMin=${payload.timeMin}`);
  console.log(`timeMax=${payload.timeMax}`);
  console.log(`fetchOk=${payload.fetchOk}`);
  console.log(`eventCount=${payload.eventCount}`);
}

export function logCalendarMutationCandidates(payload: {
  count: number;
  candidates: Array<{ id: string; title: string; startsAt: string; endsAt?: string }>;
}) {
  console.log('[CALENDAR MUTATION] candidates');
  console.log(`count=${payload.count}`);
  for (const candidate of payload.candidates) {
    console.log(
      `candidate id=${candidate.id} title=${candidate.title} start=${candidate.startsAt} end=${candidate.endsAt ?? ''}`,
    );
  }
}

export function logCalendarMutationSelection(payload: {
  eventId: string | null;
  title: string | null;
  startsAt: string | null;
  endsAt: string | null;
  selectionSource: CalendarMutationSelectionSource;
}) {
  console.log('[CALENDAR MUTATION] selected');
  console.log(`eventId=${payload.eventId ?? ''}`);
  console.log(`title=${payload.title ?? ''}`);
  console.log(`startsAt=${payload.startsAt ?? ''}`);
  console.log(`endsAt=${payload.endsAt ?? ''}`);
  console.log(`selectionSource=${payload.selectionSource}`);
}

export function logCalendarMutationVerification(payload: {
  intent: 'create_calendar_event' | 'update_calendar_event' | 'delete_calendar_event';
  verified: boolean;
  verificationFetched: boolean;
  eventId: string | null;
  detail?: string;
}) {
  console.log('[CALENDAR MUTATION] verification');
  console.log(`intent=${payload.intent}`);
  console.log(`verified=${payload.verified}`);
  console.log(`verificationFetched=${payload.verificationFetched}`);
  console.log(`eventId=${payload.eventId ?? ''}`);
  if (payload.detail) {
    console.log(`detail=${payload.detail}`);
  }
}
