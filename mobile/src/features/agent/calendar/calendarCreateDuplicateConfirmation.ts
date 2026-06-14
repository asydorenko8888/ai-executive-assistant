import { buildCreateDuplicateTitleConfirmationReply } from '@/src/features/agent/calendar/calendarConflictReplies';
import { syncConversationStateForCreateDuplicateConfirmation } from '@/src/features/agent/calendar/calendarConversationSync';
import { evaluateDuplicateTitleConfirmation } from '@/src/features/agent/calendar/calendarDuplicateTitleEvaluation';
import { fetchTimedEventsNearScheduleWindow } from '@/src/features/agent/calendar/calendarScheduleConflict';
import type { CalendarScheduleConflictBlock } from '@/src/features/agent/calendar/calendarScheduleConflictGuard';
import { resolveConflictDayOffset } from '@/src/features/agent/calendar/calendarConflictReplies';
import {
  createCalendarToolFailure,
} from '@/src/features/agent/execution/calendarToolContract';
import {
  setPendingCalendarConflictContext,
  type PendingCalendarConflictContext,
} from '@/src/features/agent/execution/calendarExecutionSession';
import { getChatLocaleFromVoiceLanguage } from '@/src/features/chat/services/voiceLanguage';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import type { CalendarEvent } from '@/src/entities/calendar/types';

function buildPendingDuplicateContext(params: {
  sourceTranscript: string;
  titleSourceTranscript?: string;
  languageCode: VoiceLanguageCode;
  proposedTitle: string;
  proposedStartMs: number;
  proposedEndMs: number;
  existingEvent: CalendarEvent;
  exactDuplicate: boolean;
}): PendingCalendarConflictContext {
  return {
    operation: 'create',
    sourceTranscript: params.sourceTranscript.trim(),
    titleSourceTranscript: params.titleSourceTranscript?.trim() || null,
    languageCode: params.languageCode,
    proposedTitle: params.proposedTitle,
    proposedStartMs: params.proposedStartMs,
    proposedEndMs: params.proposedEndMs,
    updateEventId: null,
    targetOriginalStartsAt: null,
    targetOriginalEndsAt: null,
    conflictingEventId: params.existingEvent.id,
    conflictingTitle: params.existingEvent.title,
    conflictingStartsAt: params.existingEvent.startsAt,
    conflictingEndsAt: params.existingEvent.endsAt,
    proceedDespiteConflict: false,
    confirmationKind: 'duplicate_title',
    exactDuplicate: params.exactDuplicate,
  };
}

export async function blockCalendarMutationOnDuplicateTitle(params: {
  sourceTranscript: string;
  titleSourceTranscript?: string;
  languageCode: VoiceLanguageCode;
  proposedTitle: string;
  proposedStartMs: number;
  proposedEndMs: number;
  referenceNow: Date;
  skipDuplicateTitleConfirmation?: boolean;
}): Promise<{ block: CalendarScheduleConflictBlock | null }> {
  if (params.skipDuplicateTitleConfirmation) {
    return { block: null };
  }

  const { events, fetchOk } = await fetchTimedEventsNearScheduleWindow({
    referenceNow: params.referenceNow,
    proposedStartMs: params.proposedStartMs,
    proposedEndMs: params.proposedEndMs,
  });

  if (!fetchOk) {
    return { block: null };
  }

  const evaluation = evaluateDuplicateTitleConfirmation({
    events,
    proposedTitle: params.proposedTitle,
    proposedStartMs: params.proposedStartMs,
    referenceNow: params.referenceNow,
  });

  if (!evaluation.shouldConfirm || !evaluation.existingEvent) {
    return { block: null };
  }

  const locale = getChatLocaleFromVoiceLanguage(params.languageCode);
  const dayOffset = resolveConflictDayOffset(params.proposedStartMs, params.referenceNow);
  const existingStartMs = Date.parse(evaluation.existingEvent.startsAt);

  const reply = buildCreateDuplicateTitleConfirmationReply({
    locale,
    dayOffset,
    existingTitle: evaluation.existingEvent.title,
    existingStartMs: Number.isNaN(existingStartMs) ? params.proposedStartMs : existingStartMs,
    proposedTitle: params.proposedTitle,
    proposedStartMs: params.proposedStartMs,
    exactDuplicate: evaluation.exactDuplicate,
  });

  const pendingContext = buildPendingDuplicateContext({
    sourceTranscript: params.sourceTranscript,
    titleSourceTranscript: params.titleSourceTranscript,
    languageCode: params.languageCode,
    proposedTitle: params.proposedTitle,
    proposedStartMs: params.proposedStartMs,
    proposedEndMs: params.proposedEndMs,
    existingEvent: evaluation.existingEvent,
    exactDuplicate: evaluation.exactDuplicate,
  });

  setPendingCalendarConflictContext(pendingContext);
  syncConversationStateForCreateDuplicateConfirmation(pendingContext);

  const tool = createCalendarToolFailure('CALENDAR_DUPLICATE_TITLE', reply);

  return {
    block: {
      tool,
      reply,
      spokenReply: reply,
    },
  };
}

export { evaluateDuplicateTitleConfirmation } from '@/src/features/agent/calendar/calendarDuplicateTitleEvaluation';
