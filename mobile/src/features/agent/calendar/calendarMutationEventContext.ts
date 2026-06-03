import {
  clearPendingTargetInMemory,
  setLastCalendarSnapshot,
} from '@/src/features/agent/calendar/calendarConversationStore';
import {
  recordCreatedConversationEvent,
  recordDeletedConversationEvent,
  recordModifiedConversationEvent,
  recordSearchedConversationEvent,
} from '@/src/features/agent/calendar/calendarConversationEventMemory';
import { clearPendingIntent } from '@/src/features/agent/calendar/calendarPendingIntent';
import { clearPendingCalendarState } from '@/src/features/agent/calendar/calendarPendingStateLifecycle';
import { syncCalendarSnapshotAfterMutation } from '@/src/features/agent/calendar/calendarSnapshotSync';
import type { LastCalendarEventActionType } from '@/src/features/agent/calendar/calendarLastEventContext';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';

export function recordVerifiedCalendarEventContext(params: {
  eventId: string;
  title: string;
  startISO: string;
  endISO: string;
  actionType: LastCalendarEventActionType;
  recurrenceRrule?: string | null;
  clearPendingReason?: string;
  referenceNow?: Date;
  languageCode?: VoiceLanguageCode;
  previousStartISO?: string | null;
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
    clearPendingTargetInMemory();
    clearPendingIntent(params.clearPendingReason);
    clearPendingCalendarState(params.clearPendingReason);
  }

  if (params.referenceNow) {
    void syncCalendarSnapshotAfterMutation({
      referenceNow: params.referenceNow,
      eventId: params.eventId,
      eventStartIso: params.startISO,
      previousEventStartIso: params.previousStartISO,
      languageCode: params.languageCode,
      reason:
        params.actionType === 'create'
          ? 'post_create'
          : params.actionType === 'update'
            ? 'post_update'
            : params.actionType === 'delete'
              ? 'post_delete'
              : 'post_mutation',
    }).then((result) => {
      if (result.ok) {
        setLastCalendarSnapshot(result.events, 'verified_mutation_sync');
      }
    });
  }
}
