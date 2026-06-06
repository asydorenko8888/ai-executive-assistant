import { isCalendarTimeUntilEventQuery } from '@/src/features/agent/calendar/calendarTimeUntilQuery';
import { classifyCalendarQueryIntent } from '@/src/features/agent/calendarIntelligence/classifyQuery';
import { isCalendarExactTimeReadQuery } from '@/src/features/agent/calendarIntelligence/calendarExactTimeReadDetection';
import { isOperationalCalendarWriteRequest } from '@/src/features/agent/intent/operationalCalendarWriteDetection';

/**
 * Calendar questions that only read schedule state — never CREATE/UPDATE/DELETE.
 * Must stay routable even when move/delete clarification pending state exists.
 */
export function isCalendarReadOnlyQuery(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized || isOperationalCalendarWriteRequest(normalized)) {
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
