import { isCalendarExactTimeReadQuery } from '@/src/features/agent/calendarIntelligence/calendarExactTimeReadDetection';
import { isDeterministicCalendarReadQuery } from '@/src/features/agent/calendarIntelligence/classifyQuery';

const AGENDA_READ_BYPASS =
  /\b(?:what|what's|whats|show me|tell me|какие|які|что|що).{0,40}(?:have|at|on|tonight|today|tomorrow|сьогодні|завтра|вечером|вечор)/iu;

/** Calendar reads must bypass pending conflict workflow and use live calendar data. */
export function isCalendarReadBypassDuringPendingConflict(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized) {
    return false;
  }

  return (
    isDeterministicCalendarReadQuery(normalized) ||
    isCalendarExactTimeReadQuery(normalized) ||
    AGENDA_READ_BYPASS.test(normalized)
  );
}
