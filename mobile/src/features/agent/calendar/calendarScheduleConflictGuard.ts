import { buildCreateConflictAlternativesBundle } from '@/src/features/agent/calendar/calendarCreateConflictAlternatives';
import {
  buildCalendarCreateConflictInitialReply,
  buildCalendarScheduleConflictReply,
} from '@/src/features/agent/calendar/calendarConflictReplies';
import {
  syncConversationStateForConflict,
  syncConversationStateForConflictAlternatives,
  syncConversationStateForConflictInitial,
} from '@/src/features/agent/calendar/calendarConversationSync';
import { pendingConflictContextFromCheck } from '@/src/features/agent/calendar/calendarConflictPendingContext';
import { checkCalendarScheduleConflict } from '@/src/features/agent/calendar/calendarScheduleConflict';
import { resolveScheduleConflictIgnoreEventId } from '@/src/features/agent/calendar/calendarScheduleConflictCore';
import {
  createCalendarToolFailure,
  type CalendarToolResponse,
} from '@/src/features/agent/execution/calendarToolContract';
import { getCurrentCalendarOperationEventId, setPendingCalendarConflictContext } from '@/src/features/agent/execution/calendarExecutionSession';
import { getChatLocaleFromVoiceLanguage } from '@/src/features/chat/services/voiceLanguage';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';

export type CalendarScheduleConflictBlock = {
  tool: CalendarToolResponse;
  reply: string;
  spokenReply: string;
};

export async function blockCalendarMutationOnScheduleConflict(params: {
  operation: 'create' | 'update';
  sourceTranscript: string;
  titleSourceTranscript?: string;
  languageCode: VoiceLanguageCode;
  proposedTitle: string;
  proposedStartMs: number;
  proposedEndMs: number;
  referenceNow: Date;
  updateEventId?: string;
  selfCreatedEventId?: string | null;
  skipScheduleConflictCheck?: boolean;
  /** When true, offer numbered alternatives immediately (after user declined force-create). */
  offerAlternativesImmediately?: boolean;
}): Promise<CalendarScheduleConflictBlock | null> {
  const ignoreEventId = resolveScheduleConflictIgnoreEventId({
    operation: params.operation,
    updateEventId: params.updateEventId,
    selfCreatedEventId: params.selfCreatedEventId,
    currentOperationEventId: getCurrentCalendarOperationEventId(),
  });

  const check = await checkCalendarScheduleConflict({
    referenceNow: params.referenceNow,
    proposedStartMs: params.proposedStartMs,
    proposedEndMs: params.proposedEndMs,
    ignoreEventId,
    skipCheck: params.skipScheduleConflictCheck,
  });

  if (check.status === 'clear' || check.status === 'error') {
    return null;
  }

  if (check.status === 'fetch_failed') {
    const tool = createCalendarToolFailure(
      'CALENDAR_READ_FAILED',
      'Could not refresh Google Calendar before checking schedule conflicts.',
    );

    return {
      tool,
      reply: tool.error ?? 'Calendar read failed',
      spokenReply: tool.error ?? 'Calendar read failed',
    };
  }

  const primary = check.conflicts[0];
  const locale = getChatLocaleFromVoiceLanguage(params.languageCode);

  const pendingContext = pendingConflictContextFromCheck({
    operation: params.operation,
    sourceTranscript: params.sourceTranscript,
    titleSourceTranscript: params.titleSourceTranscript,
    languageCode: params.languageCode,
    proposedTitle: params.proposedTitle,
    proposedStartMs: params.proposedStartMs,
    proposedEndMs: params.proposedEndMs,
    updateEventId: params.updateEventId,
    conflictingEventId: primary.event.id,
    conflictingTitle: primary.event.title,
    conflictingStartsAt: primary.event.startsAt,
    conflictingEndsAt: primary.event.endsAt,
  });

  let reply: string;

  if (params.operation === 'create') {
    if (params.offerAlternativesImmediately) {
      const alternativesBundle = await buildCreateConflictAlternativesBundle({
        locale,
        proposedTitle: params.proposedTitle,
        conflict: primary,
        proposedStartMs: params.proposedStartMs,
        proposedEndMs: params.proposedEndMs,
        referenceNow: params.referenceNow,
      });

      reply = alternativesBundle.reply;
      setPendingCalendarConflictContext(pendingContext);
      syncConversationStateForConflictAlternatives(pendingContext, alternativesBundle.alternativeStartMs);
    } else {
      reply = buildCalendarCreateConflictInitialReply({
        locale,
        proposedTitle: params.proposedTitle,
        conflict: primary,
      });
      setPendingCalendarConflictContext(pendingContext);
      syncConversationStateForConflictInitial(pendingContext, check.conflicts);
    }
  } else {
    reply = buildCalendarScheduleConflictReply({
      locale,
      operation: params.operation,
      proposedTitle: params.proposedTitle,
      conflict: primary,
      proposedStartMs: params.proposedStartMs,
      proposedEndMs: params.proposedEndMs,
    });
    setPendingCalendarConflictContext(pendingContext);
    syncConversationStateForConflict(pendingContext, 'WAITING_CONFLICT_DECISION', check.conflicts);
  }

  const tool = createCalendarToolFailure('CALENDAR_SCHEDULE_CONFLICT', reply);

  return {
    tool,
    reply,
    spokenReply: reply,
  };
}
