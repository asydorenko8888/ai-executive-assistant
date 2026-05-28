import type { VerifiedCalendarEvent } from '@/src/features/agent/execution/actionExecutionTypes';
import { logActionExecution } from '@/src/features/agent/execution/actionExecutionLogger';
import { parseGoogleCalendarInstant } from '@/src/features/agent/calendar/calendarTime';

type GoogleCalendarCreateResponse = {
  id?: string;
  summary?: string;
  location?: string;
  htmlLink?: string;
  status?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
};

export function verifyGoogleCalendarCreateResponse(
  payloadSummary: string,
  response: GoogleCalendarCreateResponse,
): { verified: boolean; event?: VerifiedCalendarEvent; reason?: string } {
  const id = response.id?.trim();
  const rawStart = response.start?.dateTime ?? response.start?.date;
  const rawEnd = response.end?.dateTime ?? response.end?.date;

  if (!id) {
    logActionExecution('verification_result', { verified: false, reason: 'missing_event_id' });
    return { verified: false, reason: 'missing_event_id' };
  }

  if (response.status === 'cancelled') {
    logActionExecution('verification_result', { verified: false, reason: 'cancelled_status', eventId: id });
    return { verified: false, reason: 'cancelled_status' };
  }

  if (!rawStart || !rawEnd || parseGoogleCalendarInstant(rawStart) === null) {
    logActionExecution('verification_result', { verified: false, reason: 'invalid_event_times', eventId: id });
    return { verified: false, reason: 'invalid_event_times' };
  }

  const summary = response.summary?.trim() || payloadSummary.trim();

  if (!summary) {
    logActionExecution('verification_result', { verified: false, reason: 'missing_summary', eventId: id });
    return { verified: false, reason: 'missing_summary' };
  }

  const event: VerifiedCalendarEvent = {
    id,
    summary,
    location: response.location?.trim() || undefined,
    startsAt: rawStart,
    endsAt: rawEnd,
    htmlLink: response.htmlLink?.trim() || undefined,
  };

  logActionExecution('verification_result', {
    verified: true,
    eventId: id,
    startsAt: rawStart,
    summary,
  });

  return { verified: true, event };
}
