export type {
  CalendarDayContext,
  CalendarFreeSlot,
  CalendarQueryIntent,
  DeterministicCalendarAnswer,
  NormalizedCalendarEvent,
  PreferredTimeRange,
} from '@/src/features/agent/calendarIntelligence/types';

export { buildDeterministicCalendarAnswer } from '@/src/features/agent/calendarIntelligence/calendarAnswerEngine';
export {
  classifyCalendarQueryIntent,
  isDeterministicCalendarReadQuery,
  tryBuildDeterministicCalendarReply,
} from '@/src/features/agent/calendarIntelligence/buildDeterministicReply';

export { normalizeCalendarEvents } from '@/src/features/agent/calendarIntelligence/normalizeEvents';
export { resolveTargetDayContext } from '@/src/features/agent/calendarIntelligence/resolveTargetDay';
export {
  findBestSlot,
  getEventsAtTime,
  getEventsForDay,
  getFreeWindows,
  getLastEvent,
  getNextEvent,
} from '@/src/features/agent/calendarIntelligence/scheduleHelpers';
