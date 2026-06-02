import {
  clearPendingEventInMemory,
  recordCreatedConversationEvent,
  recordDeletedConversationEvent,
  recordModifiedConversationEvent,
  recordSearchedConversationEvent,
} from '@/src/features/agent/calendar/calendarConversationEventMemory';
import { clearPendingIntent } from '@/src/features/agent/calendar/calendarPendingIntent';
import { clearPendingCalendarState } from '@/src/features/agent/calendar/calendarPendingStateLifecycle';
import type { LastCalendarEventActionType } from '@/src/features/agent/calendar/calendarLastEventContext';

export function recordVerifiedCalendarEventContext(params: {
  eventId: string;
  title: string;
  startISO: string;
  endISO: string;
  actionType: LastCalendarEventActionType;
  recurrenceRrule?: string | null;
  clearPendingReason?: string;
}) {
  if (params.actionType === 'create') {
    recordCreatedConversationEvent({
      eventId: params.eventId,
      title: params.title,
      startISO: params.startISO,
      endISO: params.endISO,
      recurrenceRrule: params.recurrenceRrule,
    });
  } else if (params.actionType === 'update') {
    recordModifiedConversationEvent({
      eventId: params.eventId,
      title: params.title,
      startISO: params.startISO,
      endISO: params.endISO,
    });
  } else if (params.actionType === 'delete') {
    recordDeletedConversationEvent({
      eventId: params.eventId,
      title: params.title,
      startISO: params.startISO,
      endISO: params.endISO,
    });
  } else {
    recordSearchedConversationEvent({
      eventId: params.eventId,
      title: params.title,
      startISO: params.startISO,
      endISO: params.endISO,
    });
  }

  if (params.clearPendingReason) {
    clearPendingEventInMemory();
    clearPendingIntent(params.clearPendingReason);
    clearPendingCalendarState(params.clearPendingReason);
  }
}
