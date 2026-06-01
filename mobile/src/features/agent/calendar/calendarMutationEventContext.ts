import {
  saveLastCalendarEventContext,
  type LastCalendarEventActionType,
} from '@/src/features/agent/calendar/calendarLastEventContext';
import { clearPendingCalendarState } from '@/src/features/agent/calendar/calendarPendingStateLifecycle';

export function recordVerifiedCalendarEventContext(params: {
  eventId: string;
  title: string;
  startISO: string;
  endISO: string;
  actionType: LastCalendarEventActionType;
  clearPendingReason?: string;
}) {
  saveLastCalendarEventContext({
    eventId: params.eventId,
    title: params.title,
    startISO: params.startISO,
    endISO: params.endISO,
    actionType: params.actionType,
  });

  if (params.clearPendingReason) {
    clearPendingCalendarState(params.clearPendingReason);
  }
}
