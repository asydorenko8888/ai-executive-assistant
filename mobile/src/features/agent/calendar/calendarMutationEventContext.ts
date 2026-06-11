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
import { logCalendarMoveWorkflow } from '@/src/features/agent/calendar/calendarMoveWorkflowLogger';
import { markCalendarMutationRefreshRequired, resetCalendarMutationRefreshRequirement } from '@/src/features/agent/calendar/calendarPreMutationRefreshState';
import { mergeMutationSearchEventsWithLocalStore } from '@/src/features/agent/calendar/calendarPreMutationRefresh';
import { syncCalendarSnapshotAfterMutation } from '@/src/features/agent/calendar/calendarSnapshotSync';
import type { LastCalendarEventActionType } from '@/src/features/agent/calendar/calendarLastEventContext';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';

export async function recordVerifiedCalendarEventContext(params: {
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

  if (!params.referenceNow) {
    return;
  }

  markCalendarMutationRefreshRequired(`verified_${params.actionType}`);

  logCalendarMoveWorkflow('CALENDAR_REFRESH_START', {
    eventId: params.eventId,
    actionType: params.actionType,
  });

  try {
    const result = await syncCalendarSnapshotAfterMutation({
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
    });

    if (result.ok) {
      logCalendarMoveWorkflow('CALENDAR_REFRESH_SUCCESS', {
        eventId: params.eventId,
        eventCount: result.events.length,
      });
      setLastCalendarSnapshot(
        mergeMutationSearchEventsWithLocalStore(result.events),
        'verified_mutation_sync',
      );
      resetCalendarMutationRefreshRequirement('verified_mutation_sync_complete');
      return;
    }

    console.log('[Calendar Move Workflow] CALENDAR_REFRESH_FAILED', {
      eventId: params.eventId,
      failureReply: result.failureReply,
    });
  } catch (error) {
    console.log('[Calendar Move Workflow] CALENDAR_REFRESH_FAILED', {
      eventId: params.eventId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
