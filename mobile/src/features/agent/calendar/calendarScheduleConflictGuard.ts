import { buildCreateConflictAlternativesBundle } from '@/src/features/agent/calendar/calendarCreateConflictAlternatives';
import {
  buildCalendarCreateConflictInitialReply,
  buildCalendarScheduleConflictReply,
} from '@/src/features/agent/calendar/calendarConflictReplies';
import {
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

export type CalendarScheduleConflictGateResult = {
  block: CalendarScheduleConflictBlock | null;
  skippedConflictCheckDueToRefreshFailure?: boolean;
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
  targetOriginalStartsAt?: string;
  targetOriginalEndsAt?: string;
  selfCreatedEventId?: string | null;
  skipScheduleConflictCheck?: boolean;
  /** When true, offer numbered alternatives immediately (after user declined force-create). */
  offerAlternativesImmediately?: boolean;
}): Promise<CalendarScheduleConflictGateResult> {
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

  if (check.status === 'clear') {
    return { block: null };
  }

  if (check.status === 'error') {
    const tool = createCalendarToolFailure(
      'CALENDAR_READ_FAILED',
      'Could not validate schedule conflicts before calendar mutation.',
    );

    return {
      block: {
        tool,
        reply: tool.error ?? 'Calendar conflict validation failed',
        spokenReply: tool.error ?? 'Calendar conflict validation failed',
      },
    };
  }

  if (check.status === 'fetch_failed') {
    console.log('[Calendar Conflict Refresh]', {
      operation: params.operation,
      refreshAttempts: check.refreshAttempts ?? null,
      proceedingWithoutConflictCheck: true,
    });

    return {
      block: null,
      skippedConflictCheckDueToRefreshFailure: true,
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
    targetOriginalStartsAt: params.targetOriginalStartsAt,
    targetOriginalEndsAt: params.targetOriginalEndsAt,
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
        proposedStartMs: params.proposedStartMs,
        proposedEndMs: params.proposedEndMs,
      });
      setPendingCalendarConflictContext(pendingContext);
      syncConversationStateForConflictInitial(pendingContext, check.conflicts);
    }
  } else {
    reply = buildCalendarScheduleConflictReply({
      locale,
      operation: 'update',
      proposedTitle: params.proposedTitle,
      conflict: primary,
      proposedStartMs: params.proposedStartMs,
      proposedEndMs: params.proposedEndMs,
    });
    setPendingCalendarConflictContext(pendingContext);
    syncConversationStateForConflictInitial(pendingContext, check.conflicts);
  }

  const tool = createCalendarToolFailure('CALENDAR_SCHEDULE_CONFLICT', reply);

  return {
    block: {
      tool,
      reply,
      spokenReply: reply,
    },
  };
}
