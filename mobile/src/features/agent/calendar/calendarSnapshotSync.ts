import type { CalendarEvent } from '@/src/entities/calendar/types';
import { refreshCalendarStateAfterMutation } from '@/src/features/agent/calendar/calendarAgendaSync';
import {
  beginCalendarSnapshotSync,
  endCalendarSnapshotSync,
  getLastCalendarSnapshot,
  setLastCalendarSnapshot,
} from '@/src/features/agent/calendar/calendarConversationStore';
import {
  getCalendarRefreshAttemptCount,
  hasExceededCalendarRefreshAttempts,
  incrementCalendarRefreshAttempt,
  resetCalendarRefreshAttempts,
} from '@/src/features/agent/calendar/calendarRefreshAttempts';
import { runDedupedCalendarSnapshotRefresh } from '@/src/features/agent/calendar/calendarSnapshotRefreshLock';
import { buildCalendarRefreshFailedReply } from '@/src/features/agent/calendar/calendarOperationUserReplies';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';

export { resetCalendarRefreshAttempts, getCalendarRefreshAttemptCount } from '@/src/features/agent/calendar/calendarRefreshAttempts';

export async function syncCalendarSnapshotAfterMutation(params: {
  referenceNow: Date;
  eventId?: string | null;
  eventStartIso?: string | null;
  previousEventStartIso?: string | null;
  languageCode?: VoiceLanguageCode;
  reason?: 'post_create' | 'post_update' | 'post_delete' | 'post_mutation';
}): Promise<{
  ok: boolean;
  events: CalendarEvent[];
  failureReply: string | null;
}> {
  if (hasExceededCalendarRefreshAttempts()) {
    const failureReply = params.languageCode
      ? buildCalendarRefreshFailedReply(params.languageCode)
      : "I couldn't refresh calendar data. Please try again.";

    endCalendarSnapshotSync({ success: false, reason: 'refresh_max_attempts' });

    return { ok: false, events: getLastCalendarSnapshot(), failureReply };
  }

  incrementCalendarRefreshAttempt();
  beginCalendarSnapshotSync(params.reason ?? 'post_mutation');

  try {
    const agenda = await runDedupedCalendarSnapshotRefresh(
      params.reason ?? 'post_mutation',
      () =>
        refreshCalendarStateAfterMutation({
          referenceNow: params.referenceNow,
          eventId: params.eventId,
          eventStartIso: params.eventStartIso,
          previousEventStartIso: params.previousEventStartIso,
          reason: params.reason === 'post_create' ? 'post_create' : 'post_mutation',
        }),
    );

    setLastCalendarSnapshot(agenda.horizonEvents, params.reason ?? 'post_mutation');
    resetCalendarRefreshAttempts('refresh_success');
    endCalendarSnapshotSync({ success: true, reason: 'snapshot_synced' });

    return { ok: true, events: agenda.horizonEvents, failureReply: null };
  } catch (error) {
    console.log('[CALENDAR SNAPSHOT SYNC] refresh failed', error);
    endCalendarSnapshotSync({ success: false, reason: 'refresh_exception' });

    const localEvents = getLastCalendarSnapshot();

    if (hasExceededCalendarRefreshAttempts()) {
      const failureReply = params.languageCode
        ? buildCalendarRefreshFailedReply(params.languageCode)
        : "I couldn't refresh calendar data. Please try again.";

      return { ok: false, events: localEvents, failureReply };
    }

    return { ok: false, events: localEvents, failureReply: null };
  }
}
