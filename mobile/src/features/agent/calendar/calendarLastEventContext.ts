import type { CalendarPendingActionType } from '@/src/features/agent/calendar/calendarConversationState';

export type LastCalendarEventActionType = 'create' | 'update' | 'delete';

export type LastCalendarEventContext = {
  eventId: string;
  title: string;
  startISO: string;
  endISO: string;
  actionType: LastCalendarEventActionType;
  savedAtMs: number;
};

export const LAST_CALENDAR_EVENT_CONTEXT_TTL_MS = 30 * 60 * 1000;

let lastCalendarEventContext: LastCalendarEventContext | null = null;

export function saveLastCalendarEventContext(context: Omit<LastCalendarEventContext, 'savedAtMs'>) {
  lastCalendarEventContext = {
    ...context,
    savedAtMs: Date.now(),
  };

  console.log('[LAST EVENT CONTEXT SAVED]');
  console.log(
    JSON.stringify({
      eventId: context.eventId,
      title: context.title,
      start: context.startISO,
      end: context.endISO,
      actionType: context.actionType,
    }),
  );
}

export function clearLastCalendarEventContext() {
  lastCalendarEventContext = null;
}

export function getLastCalendarEventContext(referenceNow: Date) {
  if (!lastCalendarEventContext) {
    return null;
  }

  const ageMs = referenceNow.getTime() - lastCalendarEventContext.savedAtMs;

  if (ageMs > LAST_CALENDAR_EVENT_CONTEXT_TTL_MS) {
    lastCalendarEventContext = null;
    return null;
  }

  return lastCalendarEventContext;
}

export function mapPendingActionToLastEventAction(
  action: CalendarPendingActionType,
): LastCalendarEventActionType {
  if (action === 'UPDATE_EVENT') {
    return 'update';
  }

  if (action === 'DELETE_EVENT') {
    return 'delete';
  }

  return 'create';
}
