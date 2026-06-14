import { isAwaitingEventDisambiguationSelectionReply, isPendingEventDisambiguationActive } from '@/src/features/agent/calendar/calendarPendingReplyClassifier';
import { looksLikeDisambiguationSelectionAttempt } from '@/src/features/agent/calendar/calendarEventDisambiguation';
import { isCalendarTimeUntilEventQuery } from '@/src/features/agent/calendar/calendarTimeUntilQuery';
import { classifyCalendarQueryIntent } from '@/src/features/agent/calendarIntelligence/classifyQuery';
import { isCalendarExactTimeReadQuery } from '@/src/features/agent/calendarIntelligence/calendarExactTimeReadDetection';
import { isOperationalCalendarWriteRequest } from '@/src/features/agent/intent/operationalCalendarWriteDetection';

/**
 * Calendar questions that only read schedule state — never CREATE/UPDATE/DELETE.
 */
export function isCalendarReadOnlyQuery(transcript: string, referenceNow: Date = new Date()) {
  const normalized = transcript.trim();

  if (!normalized || isOperationalCalendarWriteRequest(normalized)) {
    return false;
  }

  if (
    isPendingEventDisambiguationActive() &&
    looksLikeDisambiguationSelectionAttempt(normalized)
  ) {
    return false;
  }

  if (isAwaitingEventDisambiguationSelectionReply(normalized, referenceNow)) {
    return false;
  }

  if (isCalendarTimeUntilEventQuery(normalized)) {
    return true;
  }

  if (isCalendarExactTimeReadQuery(normalized)) {
    return true;
  }

  return classifyCalendarQueryIntent(normalized) !== null;
}
