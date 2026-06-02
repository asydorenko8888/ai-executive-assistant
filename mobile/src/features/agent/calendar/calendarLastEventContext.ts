import type { CalendarPendingActionType } from '@/src/features/agent/calendar/calendarConversationState';
import {
  recordCreatedConversationEvent,
  recordModifiedConversationEvent,
  recordSearchedConversationEvent,
  resolveConversationEventReference,
  CONVERSATION_EVENT_MEMORY_TTL_MS,
} from '@/src/features/agent/calendar/calendarConversationEventMemory';

export type LastCalendarEventActionType = 'create' | 'update' | 'delete';

export type LastCalendarEventContext = {
  eventId: string;
  title: string;
  startISO: string;
  endISO: string;
  actionType: LastCalendarEventActionType;
  savedAtMs: number;
};

export const LAST_CALENDAR_EVENT_CONTEXT_TTL_MS = CONVERSATION_EVENT_MEMORY_TTL_MS;

export function saveLastCalendarEventContext(context: Omit<LastCalendarEventContext, 'savedAtMs'>) {
  if (context.actionType === 'create') {
    recordCreatedConversationEvent({
      eventId: context.eventId,
      title: context.title,
      startISO: context.startISO,
      endISO: context.endISO,
    });
    return;
  }

  if (context.actionType === 'update') {
    recordModifiedConversationEvent({
      eventId: context.eventId,
      title: context.title,
      startISO: context.startISO,
      endISO: context.endISO,
    });
    return;
  }

  recordSearchedConversationEvent({
    eventId: context.eventId,
    title: context.title,
    startISO: context.startISO,
    endISO: context.endISO,
  });
}

export function clearLastCalendarEventContext() {
  // Legacy API — full reset is handled by resetConversationEventMemory on session reset.
}

export function getLastCalendarEventContext(referenceNow: Date) {
  const ref = resolveConversationEventReference(referenceNow);

  if (!ref) {
    return null;
  }

  const actionType: LastCalendarEventActionType =
    ref.source === 'update'
      ? 'update'
      : ref.source === 'delete'
        ? 'delete'
        : ref.source === 'search'
          ? 'update'
          : 'create';

  return {
    eventId: ref.eventId,
    title: ref.title,
    startISO: ref.startISO,
    endISO: ref.endISO,
    actionType,
    savedAtMs: ref.savedAtMs,
  };
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
