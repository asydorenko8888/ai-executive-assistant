import { isCalendarReadBypassDuringPendingConflict } from '@/src/features/agent/calendar/calendarPendingConflictReadBypass';
import type { AssistantExecutionState } from '@/src/features/agent/conversation/assistantExecutionObservability';
import type { CalendarCommandKind } from '@/src/features/agent/calendar/calendarCommandTypes';
import { cancelCalendarConversation } from '@/src/features/agent/calendar/calendarConversationCancel';
import {
  buildCalendarConflictAlternativesOnlyReply,
  buildCalendarUpdateConflictAlternativesOnlyReply,
  buildVagueConflictTimeClarificationReply,
  formatConflictSlotLabelWithDay,
  resolveConflictDayOffset,
} from '@/src/features/agent/calendar/calendarConflictReplies';
import { buildConflictAlternativeOptionSlots } from '@/src/features/agent/calendar/calendarConflictAlternativeSlots';
import {
  buildTranscriptFromPendingDeleteContext,
  tryMergePendingCalendarDeleteReply,
} from '@/src/features/agent/calendar/calendarDeletePendingContext';
import { logDeleteExecutionEventId } from '@/src/features/agent/calendar/calendarDeleteDiagnostics';
import {
  buildTranscriptFromPendingContext,
  tryMergePendingCalendarUpdateReply,
} from '@/src/features/agent/calendar/calendarUpdatePendingContext';
import {
  ensurePendingUpdateContextHydrated,
  resolveStoredMoveClarificationReply,
} from '@/src/features/agent/calendar/calendarMoveClarificationState';
import {
  enrichTranscriptForActivePendingConflict,
  isExplicitDifferentCalendarCommand,
} from '@/src/features/agent/calendar/calendarPendingConflictEnrichment';
import {
  classifyPendingCalendarReply,
  logPendingReplyClassified,
} from '@/src/features/agent/calendar/calendarPendingReplyClassifier';
import { resolveStoredUpdateTargetFromPending } from '@/src/features/agent/calendar/calendarPendingConflictTarget';
import { logCalendarPendingActionExecuted } from '@/src/features/agent/calendar/calendarMoveTraceLogger';
import { clearMoveUpdateWorkflowState } from '@/src/features/agent/calendar/calendarMoveUpdateLifecycle';
import {
  finalizeCalendarPendingStateAfterMutation,
  dismissCalendarConflictConfirmationState,
} from '@/src/features/agent/calendar/calendarPendingStateLifecycle';
import { classifyCalendarShortReply } from '@/src/features/agent/calendar/calendarShortReply';
import {
  getCalendarConversationSnapshot,
  isCalendarConflictDecisionState,
  logCalendarConversationEvent,
  mapPendingActionTypeToCommandIntent,
  transitionCalendarConversationState,
  type CalendarConversationState,
  type CalendarPendingAction,
} from '@/src/features/agent/calendar/calendarConversationState';
import { getConversationEventMemory } from '@/src/features/agent/calendar/calendarConversationEventMemory';
import {
  buildConflictFollowUpTranscript,
  buildRetriedTranscriptFromStartMs,
  resolvePendingConflictResolution,
} from '@/src/features/agent/calendar/calendarPendingConflictResolution';
import { buildCreateConflictAlternativesBundle } from '@/src/features/agent/calendar/calendarCreateConflictAlternatives';
import {
  syncConversationStateForConflictAlternatives,
} from '@/src/features/agent/calendar/calendarConversationSync';
import { fetchTimedEventsNearScheduleWindow } from '@/src/features/agent/calendar/calendarScheduleConflict';
import { executeCalendarCreateEvent } from '@/src/features/agent/execution/calendarCreateEventExecutor';
import { executeCalendarUpdateEvent } from '@/src/features/agent/execution/calendarUpdateEventExecutor';
import { executeCalendarDeleteEvent } from '@/src/features/agent/execution/calendarDeleteEventExecutor';
import {
  acknowledgeCalendarConflictConfirmation,
  getPendingCalendarConflictContext,
  getPendingCalendarDeleteContext,
  getPendingCalendarUpdateContext,
  setLastCalendarCommandOutcome,
  setPendingCalendarDeleteContext,
  setPendingCalendarUpdateContext,
} from '@/src/features/agent/execution/calendarExecutionSession';
import {
  createCalendarToolFailure,
  type CalendarToolResponse,
  type CalendarToolStatus,
} from '@/src/features/agent/execution/calendarToolContract';
import {
  isVerifiedCalendarCreateSuccess,
  isVerifiedCalendarDeleteSuccess,
  isVerifiedCalendarUpdateSuccess,
} from '@/src/features/agent/calendar/calendarExecutionContract';
import { normalizeCalendarEvents } from '@/src/features/agent/calendarIntelligence/normalizeEvents';
import type { PreferredTimeRange } from '@/src/features/agent/calendarIntelligence/types';
import { formatDateKey } from '@/src/features/agent/calendarIntelligence/zonedEventTime';
import {
  addDaysToZonedYmd,
  getExecutiveCalendarTimezone,
  getZonedDayRange,
  getZonedYmd,
} from '@/src/features/agent/calendar/calendarTimezone';
import { parseGoogleCalendarInstant } from '@/src/features/agent/calendar/calendarTime';
import { getChatLocaleFromVoiceLanguage, type VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';

export type CalendarConversationTurnResult = {
  matched: boolean;
  intent: CalendarCommandKind;
  reply: string;
  spokenReply: string;
  toolStatus: CalendarToolStatus;
  executionState: AssistantExecutionState;
  verified: boolean;
  requiresCalendarAuth?: boolean;
  eventId?: string | null;
};

function mapOutcome(params: {
  intent: CalendarCommandKind;
  tool: CalendarToolResponse;
  reply: string;
  spokenReply: string;
  verified: boolean;
  requiresCalendarAuth?: boolean;
  eventId?: string | null;
}): CalendarConversationTurnResult {
  setLastCalendarCommandOutcome({
    intent: params.intent,
    tool: params.tool,
    terminalReply: params.reply,
    verified: params.verified,
  });

  return {
    matched: true,
    intent: params.intent,
    reply: params.reply,
    spokenReply: params.spokenReply,
    toolStatus: params.verified ? 'SUCCESS' : params.tool.status === 'SUCCESS' ? 'FAILURE' : params.tool.status,
    executionState: params.verified ? 'tool_success' : params.tool.status === 'PENDING' ? 'tool_call' : 'tool_failure',
    verified: params.verified,
    requiresCalendarAuth: params.requiresCalendarAuth,
    eventId: params.eventId ?? null,
  };
}

function cancelPendingOperation(pending: CalendarPendingAction, incomingMessage?: string) {
  return mapOutcome(cancelCalendarConversation(pending, incomingMessage));
}

async function buildAlternativeSlotsReply(
  pending: CalendarPendingAction,
  preferredRange?: PreferredTimeRange,
) {
  const locale = getChatLocaleFromVoiceLanguage(pending.languageCode);
  const timeZone = getExecutiveCalendarTimezone();
  const referenceNow = new Date();
  const dayOffset = resolveConflictDayOffset(pending.requestedStartMs, referenceNow);
  const range = getZonedDayRange(referenceNow, dayOffset, timeZone);
  const targetYmd = addDaysToZonedYmd(getZonedYmd(referenceNow, timeZone), dayOffset);
  const day = {
    dateKey: formatDateKey(targetYmd),
    dayOffset,
    range,
    timezone: timeZone,
  };

  const { events, fetchOk } = await fetchTimedEventsNearScheduleWindow({
    referenceNow,
    proposedStartMs: pending.requestedStartMs,
    proposedEndMs: pending.requestedEndMs,
  });

  if (!fetchOk) {
    return {
      reply: 'Could not refresh the calendar to suggest free slots.',
      alternativeStartMs: [] as number[],
      optionLabels: [] as string[],
    };
  }

  const normalized = normalizeCalendarEvents(events, timeZone);
  const durationMinutes = Math.max(
    15,
    Math.round((pending.requestedEndMs - pending.requestedStartMs) / 60_000),
  );
  const conflictEndMs = pending.conflictEvents[0]
    ? Date.parse(pending.conflictEvents[0].endsAt)
    : pending.requestedEndMs;
  const slots = buildConflictAlternativeOptionSlots({
    events: normalized,
    day,
    referenceNow,
    durationMinutes,
    excludeStartMs: pending.requestedStartMs,
    excludeEndMs: pending.requestedEndMs,
    preferredRange,
    conflictEndMs,
  });
  const alternativeStartMs = slots
    .map((slot) => parseGoogleCalendarInstant(slot.startISO) ?? 0)
    .filter((value) => value > 0);
  const optionLabels = slots.map((slot) =>
    formatConflictSlotLabelWithDay({
      slot,
      referenceNow,
      locale,
      timeZone,
    }),
  );

  return {
    reply:
      pending.action === 'UPDATE_EVENT'
        ? buildCalendarUpdateConflictAlternativesOnlyReply({
            locale,
            proposedTitle: pending.eventTitle,
            optionLabels,
          })
        : buildCalendarConflictAlternativesOnlyReply({
            locale,
            proposedTitle: pending.eventTitle,
            optionLabels,
          }),
    alternativeStartMs,
    optionLabels,
  };
}

function conflictAwaitingReminder(
  languageCode: VoiceLanguageCode,
  pendingAction?: CalendarPendingAction,
) {
  const locale = getChatLocaleFromVoiceLanguage(languageCode);

  if (pendingAction?.action === 'UPDATE_EVENT') {
    if (locale === 'uk') {
      return 'Скажіть «так», щоб продовжити, «ні», щоб скасувати, або «запропонуй інший час».';
    }

    if (locale === 'ru') {
      return 'Скажите «да», чтобы продолжить, «нет», чтобы отменить, или «предложи другое время».';
    }

    return 'Say "yes" to proceed, "no" to cancel, or ask for another time.';
  }

  if (locale === 'uk') {
    return 'Скажіть «так», «ні» або «запропонуй інший час».';
  }

  if (locale === 'ru') {
    return 'Скажите «да», «нет» или «предложи другое время».';
  }

  return 'Say "yes", "no", or ask for another time.';
}

type ExecutePendingMutationParams = {
  pending: CalendarPendingAction;
  referenceNow: Date;
  calendarConnected: boolean;
  skipScheduleConflictCheck?: boolean;
  skipDuplicateTitleConfirmation?: boolean;
  transcriptOverride?: string;
  selectedEventId?: string | null;
  scheduleOverride?: {
    startMs: number;
    endMs: number;
    explicitDayOffset: number;
  };
};

function beginConfirmedConflictMutation(params: ExecutePendingMutationParams) {
  const transcript = params.transcriptOverride ?? params.pending.sourceTranscript;

  dismissCalendarConflictConfirmationState('conflict_confirmed', transcript);
  acknowledgeCalendarConflictConfirmation();
}

function shouldUseStoredConflictUpdateTarget(params: ExecutePendingMutationParams) {
  if (!params.skipScheduleConflictCheck || params.scheduleOverride) {
    return false;
  }

  if (
    params.transcriptOverride &&
    params.transcriptOverride.trim() !== params.pending.sourceTranscript.trim()
  ) {
    return false;
  }

  return Boolean(resolveStoredUpdateTargetFromPending(params.pending));
}

async function executePendingMutation(params: ExecutePendingMutationParams) {
  const transcript = params.transcriptOverride ?? params.pending.sourceTranscript;
  const titleSourceTranscript = params.pending.titleSourceTranscript ?? params.pending.sourceTranscript;
  const intent = mapPendingActionTypeToCommandIntent(params.pending.action);

  if (params.pending.action === 'DELETE_EVENT') {
    const deletePending = getPendingCalendarDeleteContext();
    const selectedEventId = params.selectedEventId ?? deletePending?.selectedEventId ?? null;
    logDeleteExecutionEventId({
      phase: 'executePendingMutation',
      eventId: selectedEventId,
      transcriptPreview: transcript.slice(0, 120),
      source: params.selectedEventId
        ? 'selectedEventId_param'
        : deletePending?.selectedEventId
          ? 'pending_context'
          : 'resolution',
    });
    const outcome = await executeCalendarDeleteEvent({
      transcript,
      languageCode: params.pending.languageCode,
      referenceNow: params.referenceNow,
      selectedEventId,
    });

    const verified = isVerifiedCalendarDeleteSuccess(outcome.tool);

    finalizeCalendarPendingStateAfterMutation({
      verified,
      tool: outcome.tool,
      reason: 'delete_completed',
      transcript,
    });

    return mapOutcome({
      intent,
      tool: outcome.tool,
      reply: outcome.reply,
      spokenReply: outcome.spokenReply,
      verified,
      requiresCalendarAuth: outcome.requiresCalendarAuth,
      eventId: outcome.tool.eventId ?? null,
    });
  }

  if (params.pending.action === 'UPDATE_EVENT') {
    const storedUpdateTarget = shouldUseStoredConflictUpdateTarget(params)
      ? resolveStoredUpdateTargetFromPending(params.pending)
      : null;

    const updatePending = getPendingCalendarUpdateContext();
    const selectedEventId = params.selectedEventId ?? updatePending?.selectedEventId ?? null;

    if (selectedEventId) {
      logCalendarPendingActionExecuted({
        action: 'move',
        selectedEventId,
        sourceTranscript: transcript,
      });
    }

    const outcome = await executeCalendarUpdateEvent({
      transcript,
      languageCode: params.pending.languageCode,
      referenceNow: params.referenceNow,
      skipScheduleConflictCheck: params.skipScheduleConflictCheck,
      storedUpdateTarget: storedUpdateTarget ?? undefined,
      selectedEventId,
    });

    const verified = isVerifiedCalendarUpdateSuccess(outcome.tool);

    finalizeCalendarPendingStateAfterMutation({
      verified,
      tool: outcome.tool,
      reason: 'update_completed',
      transcript,
    });

    return mapOutcome({
      intent,
      tool: outcome.tool,
      reply: outcome.reply,
      spokenReply: outcome.spokenReply,
      verified,
      requiresCalendarAuth: outcome.requiresCalendarAuth,
      eventId: outcome.tool.eventId ?? null,
    });
  }

  const outcome = await executeCalendarCreateEvent({
    transcript,
    titleSourceTranscript,
    languageCode: params.pending.languageCode,
    calendarConnected: params.calendarConnected,
    referenceNow: params.referenceNow,
    skipScheduleConflictCheck: params.skipScheduleConflictCheck,
    skipDuplicateTitleConfirmation: params.skipDuplicateTitleConfirmation,
    scheduleOverride: params.scheduleOverride,
  });

  const verified = isVerifiedCalendarCreateSuccess(outcome.tool);

  finalizeCalendarPendingStateAfterMutation({
    verified,
    tool: outcome.tool,
    reason: 'create_completed',
    transcript,
  });

  return mapOutcome({
    intent,
    tool: outcome.tool,
    reply: outcome.reply,
    spokenReply: outcome.spokenReply,
    verified,
    requiresCalendarAuth: outcome.requiresCalendarAuth,
    eventId: outcome.tool.eventId ?? null,
  });
}

function logWaitingConflictConfirmation(params: {
  conversationState: CalendarConversationState;
  userText: string;
  decision: 'approve' | 'reject' | 'cancel' | 'suggest_alternatives' | 'alternate_time' | 'remind' | 'other';
  pending: CalendarPendingAction;
}) {
  if (
    params.conversationState !== 'WAITING_CONFLICT_CONFIRMATION' &&
    params.conversationState !== 'WAITING_CONFLICT_DECISION'
  ) {
    return;
  }

  console.log('WAITING_CONFLICT_CONFIRMATION');
  console.log('User response:', params.userText);
  console.log('Decision:', params.decision);
  console.log('pendingEvent:', getConversationEventMemory().pendingEvent);
}

async function handleConflictDecisionState(params: {
  pending: CalendarPendingAction;
  transcript: string;
  referenceNow: Date;
  calendarConnected: boolean;
  classification: ReturnType<typeof classifyPendingCalendarReply>;
  conversationState: CalendarConversationState;
}) {
  const intent = mapPendingActionTypeToCommandIntent(params.pending.action);
  const resolution = resolvePendingConflictResolution({
    pending: params.pending,
    transcript: params.transcript,
    classification: params.classification,
    referenceNow: params.referenceNow,
  });

  logWaitingConflictConfirmation({
    conversationState: params.conversationState,
    userText: params.transcript,
    decision:
      resolution.kind === 'execute_original' ||
      resolution.kind === 'execute_with_schedule' ||
      resolution.kind === 'execute_with_time' ||
      resolution.kind === 'pick_alternative'
        ? 'approve'
        : resolution.kind === 'cancel'
          ? 'reject'
          : resolution.kind === 'suggest_alternatives'
            ? 'reject'
            : resolution.kind === 'remind'
              ? 'remind'
              : 'other',
    pending: params.pending,
  });

  console.log('[PENDING CONFLICT RESOLUTION]');
  console.log(JSON.stringify({ kind: resolution.kind, transcriptPreview: params.transcript.slice(0, 120) }));

  if (resolution.kind === 'cancel') {
    return cancelPendingOperation(params.pending, params.transcript);
  }

  if (resolution.kind === 'suggest_vague_time') {
    const locale = getChatLocaleFromVoiceLanguage(params.pending.languageCode);
    const conflictLegacy = getPendingCalendarConflictContext();
    const slotResult = await buildAlternativeSlotsReply(
      params.pending,
      resolution.preferredRange,
    );
    const reply = buildVagueConflictTimeClarificationReply({
      locale,
      optionLabels: slotResult.optionLabels,
    });

    if (conflictLegacy) {
      syncConversationStateForConflictAlternatives(conflictLegacy, slotResult.alternativeStartMs);
    } else {
      transitionCalendarConversationState({
        toState: 'WAITING_ALTERNATIVE_SLOT',
        pendingAction: {
          ...params.pending,
          alternativeStartMs: slotResult.alternativeStartMs,
        },
        reason: 'vague_time_follow_up',
        incomingMessage: params.transcript,
      });
    }

    return mapOutcome({
      intent,
      tool: createCalendarToolFailure('CALENDAR_SCHEDULE_CONFLICT', 'Awaiting specific time selection'),
      reply,
      spokenReply: reply,
      verified: false,
    });
  }

  if (resolution.kind === 'suggest_alternatives') {
    const locale = getChatLocaleFromVoiceLanguage(params.pending.languageCode);
    const conflictLegacy = getPendingCalendarConflictContext();
    let reply: string;
    let alternativeStartMs: number[] = [];

    if (params.pending.action === 'CREATE_EVENT' && conflictLegacy) {
      const primaryConflict = params.pending.conflictEvents[0];

      if (primaryConflict) {
        const bundle = await buildCreateConflictAlternativesBundle({
          locale,
          proposedTitle: params.pending.eventTitle,
          conflict: {
            event: {
              id: primaryConflict.eventId,
              title: primaryConflict.title,
              startsAt: primaryConflict.startsAt,
              endsAt: primaryConflict.endsAt,
              isAllDay: false,
            },
            startsAtMs: Date.parse(primaryConflict.startsAt),
            endsAtMs: Date.parse(primaryConflict.endsAt),
          },
          proposedStartMs: params.pending.requestedStartMs,
          proposedEndMs: params.pending.requestedEndMs,
          referenceNow: params.referenceNow,
          preferredRange: resolution.preferredRange,
        });

        reply = bundle.reply;
        alternativeStartMs = bundle.alternativeStartMs;
        syncConversationStateForConflictAlternatives(conflictLegacy, alternativeStartMs);
      } else {
        const slotResult = await buildAlternativeSlotsReply(
          params.pending,
          resolution.preferredRange,
        );
        reply = slotResult.reply;
        alternativeStartMs = slotResult.alternativeStartMs;
        syncConversationStateForConflictAlternatives(conflictLegacy, alternativeStartMs);
      }
    } else {
      const slotResult = await buildAlternativeSlotsReply(
        params.pending,
        resolution.preferredRange,
      );

      reply = slotResult.reply;
      alternativeStartMs = slotResult.alternativeStartMs;

      if (conflictLegacy) {
        syncConversationStateForConflictAlternatives(conflictLegacy, alternativeStartMs);
      } else {
        transitionCalendarConversationState({
          toState: 'WAITING_ALTERNATIVE_SLOT',
          pendingAction: {
            ...params.pending,
            alternativeStartMs,
          },
          reason: 'user_requested_alternatives',
          incomingMessage: params.transcript,
        });
      }
    }

    return mapOutcome({
      intent,
      tool: createCalendarToolFailure('CALENDAR_SCHEDULE_CONFLICT', 'Awaiting alternative time selection'),
      reply,
      spokenReply: reply,
      verified: false,
    });
  }

  if (resolution.kind === 'pick_alternative') {
    const mutationParams: ExecutePendingMutationParams = {
      pending: params.pending,
      referenceNow: params.referenceNow,
      calendarConnected: params.calendarConnected,
      transcriptOverride: buildRetriedTranscriptFromStartMs(params.pending, resolution.startMs),
      skipScheduleConflictCheck: true,
    };

    beginConfirmedConflictMutation(mutationParams);

    return executePendingMutation(mutationParams);
  }

  if (resolution.kind === 'execute_original') {
    const mutationParams: ExecutePendingMutationParams = {
      pending: params.pending,
      referenceNow: params.referenceNow,
      calendarConnected: params.calendarConnected,
      skipScheduleConflictCheck: resolution.skipScheduleConflictCheck,
      skipDuplicateTitleConfirmation:
        params.pending.clarificationKind === 'create_duplicate_confirmation',
    };

    beginConfirmedConflictMutation(mutationParams);

    return executePendingMutation(mutationParams);
  }

  if (resolution.kind === 'execute_with_schedule') {
    const mutationParams: ExecutePendingMutationParams = {
      pending: params.pending,
      referenceNow: params.referenceNow,
      calendarConnected: params.calendarConnected,
      transcriptOverride: buildConflictFollowUpTranscript(params.pending, params.transcript),
      scheduleOverride: {
        startMs: resolution.startMs,
        endMs: resolution.endMs,
        explicitDayOffset: resolution.explicitDayOffset,
      },
    };

    beginConfirmedConflictMutation(mutationParams);

    return executePendingMutation(mutationParams);
  }

  if (resolution.kind === 'execute_with_time') {
    const mutationParams: ExecutePendingMutationParams = {
      pending: params.pending,
      referenceNow: params.referenceNow,
      calendarConnected: params.calendarConnected,
      transcriptOverride: resolution.transcript,
    };

    beginConfirmedConflictMutation(mutationParams);

    return executePendingMutation(mutationParams);
  }

  const reminder = conflictAwaitingReminder(params.pending.languageCode, params.pending);

  return mapOutcome({
    intent,
    tool: createCalendarToolFailure('CALENDAR_SCHEDULE_CONFLICT', 'Awaiting conflict confirmation'),
    reply: reminder,
    spokenReply: reminder,
    verified: false,
  });
}

async function handleDeleteOrSelectionState(params: {
  pending: CalendarPendingAction;
  transcript: string;
  referenceNow: Date;
  classification: ReturnType<typeof classifyPendingCalendarReply>;
}): Promise<CalendarConversationTurnResult | null> {
  const short = classifyCalendarShortReply(params.transcript);

  if (short === 'cancel_abort') {
    return cancelPendingOperation(params.pending, params.transcript);
  }

  const deletePending = getPendingCalendarDeleteContext();

  if (deletePending) {
    const merged = tryMergePendingCalendarDeleteReply({
      pending: deletePending,
      reply: params.transcript,
      referenceNow: params.referenceNow,
    });

    if (merged) {
      setPendingCalendarDeleteContext(merged.context);

      return executePendingMutation({
        pending: { ...params.pending, sourceTranscript: merged.transcript },
        referenceNow: params.referenceNow,
        calendarConnected: true,
        transcriptOverride: merged.transcript,
        selectedEventId: merged.selectedEventId ?? null,
      });
    }
  }

  const updatePending = getPendingCalendarUpdateContext();
  const hydratedUpdatePending = updatePending ?? ensurePendingUpdateContextHydrated(params.referenceNow);

  if (hydratedUpdatePending) {
    const merged =
      resolveStoredMoveClarificationReply({
        reply: params.transcript,
        referenceNow: params.referenceNow,
      }) ??
      tryMergePendingCalendarUpdateReply({
        pending: hydratedUpdatePending,
        reply: params.transcript,
        referenceNow: params.referenceNow,
      });

    if (merged) {
      setPendingCalendarUpdateContext(merged.context);

      const transcriptOverride =
        merged.selectedEventId != null
          ? merged.context.sourceTranscript
          : merged.transcript;

      return executePendingMutation({
        pending: { ...params.pending, sourceTranscript: transcriptOverride },
        referenceNow: params.referenceNow,
        calendarConnected: true,
        transcriptOverride,
        selectedEventId: merged.selectedEventId ?? null,
      });
    }
  }

  if (short === 'proceed' && deletePending) {
    return executePendingMutation({
      pending: params.pending,
      referenceNow: params.referenceNow,
      calendarConnected: true,
      transcriptOverride: buildTranscriptFromPendingDeleteContext(deletePending),
    });
  }

  if (params.classification === 'unrelated' || params.classification === 'new_calendar_command') {
    clearMoveUpdateWorkflowState('unrelated_during_event_selection', params.transcript);
    return null;
  }

  const intent = mapPendingActionTypeToCommandIntent(params.pending.action);
  const reminder =
    getChatLocaleFromVoiceLanguage(params.pending.languageCode) === 'uk'
      ? 'Уточніть, яке саме подію обрати.'
      : getChatLocaleFromVoiceLanguage(params.pending.languageCode) === 'ru'
        ? 'Уточните, какое именно событие выбрать.'
        : 'Please clarify which event you mean.';

  return mapOutcome({
    intent,
    tool: createCalendarToolFailure('CALENDAR_EVENT_AMBIGUOUS', 'Awaiting event selection'),
    reply: reminder,
    spokenReply: reminder,
    verified: false,
  });
}

async function handleMoveConfirmation(params: {
  pending: CalendarPendingAction;
  transcript: string;
  referenceNow: Date;
  calendarConnected: boolean;
  classification: ReturnType<typeof classifyPendingCalendarReply>;
}): Promise<CalendarConversationTurnResult | null> {
  const short = classifyCalendarShortReply(params.transcript);

  if (short === 'cancel_abort') {
    return cancelPendingOperation(params.pending, params.transcript);
  }

  const updatePending = getPendingCalendarUpdateContext();

  if (updatePending) {
    const merged = tryMergePendingCalendarUpdateReply({
      pending: updatePending,
      reply: params.transcript,
      referenceNow: params.referenceNow,
    });

    if (merged) {
      setPendingCalendarUpdateContext(merged.context);

      const transcriptOverride =
        merged.selectedEventId != null
          ? merged.context.sourceTranscript
          : merged.transcript;

      return executePendingMutation({
        pending: { ...params.pending, sourceTranscript: transcriptOverride },
        referenceNow: params.referenceNow,
        calendarConnected: params.calendarConnected,
        transcriptOverride,
        selectedEventId: merged.selectedEventId ?? null,
      });
    }
  }

  if (short === 'proceed' && updatePending) {
    return executePendingMutation({
      pending: params.pending,
      referenceNow: params.referenceNow,
      calendarConnected: params.calendarConnected,
      transcriptOverride: buildTranscriptFromPendingContext(updatePending),
    });
  }

  if (params.classification === 'unrelated' || params.classification === 'new_calendar_command') {
    clearMoveUpdateWorkflowState('unrelated_during_move_confirmation', params.transcript);
    return null;
  }

  return handleConflictDecisionState({
    pending: params.pending,
    transcript: params.transcript,
    referenceNow: params.referenceNow,
    calendarConnected: params.calendarConnected,
    classification: params.classification,
    conversationState: getCalendarConversationSnapshot().state,
  });
}

export async function handleCalendarConversationTurn(params: {
  transcript: string;
  languageCode: VoiceLanguageCode;
  referenceNow: Date;
  titleSourceTranscript?: string;
  calendarConnected: boolean;
}): Promise<CalendarConversationTurnResult | null> {
  if (isCalendarReadBypassDuringPendingConflict(params.transcript.trim())) {
    return null;
  }

  const snapshot = getCalendarConversationSnapshot();

  if (snapshot.state === 'IDLE' || !snapshot.pendingAction) {
    return null;
  }

  const pending = snapshot.pendingAction;
  const inConflictWorkflow = isCalendarConflictDecisionState(snapshot.state);
  const selectionReply = params.titleSourceTranscript?.trim() || params.transcript;
  let effectiveTranscript = selectionReply;

  const classification = classifyPendingCalendarReply(selectionReply);

  if (
    inConflictWorkflow &&
    !isExplicitDifferentCalendarCommand(selectionReply, pending) &&
    classification === 'alternate_time'
  ) {
    effectiveTranscript = enrichTranscriptForActivePendingConflict(selectionReply, pending);
  }

  logPendingReplyClassified({
    transcript: effectiveTranscript,
    classification,
    pendingActionId: pending.pendingActionId,
  });

  if (classification === 'new_calendar_command' && !inConflictWorkflow) {
    const updatePending = getPendingCalendarUpdateContext();
    const deletePending = getPendingCalendarDeleteContext();
    const repeatingOriginalMove =
      updatePending?.candidates?.length &&
      updatePending.sourceTranscript.trim() === selectionReply.trim();
    const deleteSelectionFollowUp =
      deletePending?.selectedEventId != null ||
      (deletePending?.candidates?.length
        ? Boolean(
            tryMergePendingCalendarDeleteReply({
              pending: deletePending,
              reply: selectionReply,
              referenceNow: params.referenceNow,
            }),
          )
        : false);

    if (!repeatingOriginalMove && !deleteSelectionFollowUp) {
      return null;
    }
  }

  logCalendarConversationEvent({
    event: 'incoming',
    incomingMessage: params.transcript,
    toState: snapshot.state,
    pendingAction: pending,
    detail: classification,
  });

  let result: CalendarConversationTurnResult | null;

  switch (snapshot.state) {
    case 'WAITING_CONFLICT_RESOLUTION':
    case 'WAITING_CONFLICT_DECISION':
    case 'WAITING_CONFLICT_CONFIRMATION':
    case 'WAITING_ALTERNATIVE_SELECTION':
    case 'WAITING_ALTERNATIVE_SLOT':
    case 'WAITING_EVENT_CONFIRMATION':
    case 'WAITING_NEW_TIME':
      result = await handleConflictDecisionState({
        pending,
        transcript: effectiveTranscript,
        referenceNow: params.referenceNow,
        calendarConnected: params.calendarConnected,
        classification,
        conversationState: snapshot.state,
      });
      break;
    case 'WAITING_DELETE_CONFIRMATION':
    case 'AWAITING_EVENT_SELECTION':
    case 'WAITING_EVENT_SELECTION':
      result = await handleDeleteOrSelectionState({
        pending,
        transcript: selectionReply,
        referenceNow: params.referenceNow,
        classification,
      });
      break;
    case 'WAITING_MOVE_CONFIRMATION':
      result = await handleMoveConfirmation({
        pending,
        transcript: params.transcript,
        referenceNow: params.referenceNow,
        calendarConnected: params.calendarConnected,
        classification,
      });
      break;
    default:
      return null;
  }

  if (!result) {
    return null;
  }

  logCalendarConversationEvent({
    event: 'handled',
    incomingMessage: params.transcript,
    toState: getCalendarConversationSnapshot().state,
    pendingAction: getCalendarConversationSnapshot().pendingAction,
    detail: `verified=${result.verified}`,
  });

  return result;
}
