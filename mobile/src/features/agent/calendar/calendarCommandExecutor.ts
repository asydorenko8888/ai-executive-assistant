import type { AssistantExecutionState } from '@/src/features/agent/conversation/assistantExecutionObservability';
import {
  detectCalendarCommandIntent,
  requiresCalendarCommandExecution,
  type CalendarCommandKind,
} from '@/src/features/agent/calendar/calendarCommandTypes';
import {
  buildCalendarMoveExceptionReply,
  ensureVisibleCalendarMoveReply,
} from '@/src/features/agent/calendar/calendarMoveExceptionReply';
import { logCalendarMoveWorkflow } from '@/src/features/agent/calendar/calendarMoveWorkflowLogger';
import {
  buildFailureTerminalReply,
  isVerifiedCalendarCreateSuccess,
  isVerifiedCalendarDeleteSuccess,
  isVerifiedCalendarUpdateSuccess,
} from '@/src/features/agent/calendar/calendarExecutionContract';
import {
  extractCalendarCommand,
  isCalendarExtractionExecutable,
} from '@/src/features/agent/calendar/calendarCommandExtractor';
import { handleCalendarConversationTurn } from '@/src/features/agent/calendar/calendarConversationTurnHandler';
import { isCalendarReadBypassDuringPendingConflict } from '@/src/features/agent/calendar/calendarPendingConflictReadBypass';
import {
  classifyPendingCalendarReply,
  logPendingReplyClassified,
} from '@/src/features/agent/calendar/calendarPendingReplyClassifier';
import {
  clearMoveUpdateWorkflowState,
  shouldClearMoveUpdateSelectionOnUnrelatedReply,
} from '@/src/features/agent/calendar/calendarMoveUpdateLifecycle';
import {
  clearPendingCalendarState,
  expirePendingCalendarStateIfStale,
  finalizeCalendarPendingStateAfterMutation,
  logNewCommandOverridesPending,
  recoverStalePendingCalendarAction,
} from '@/src/features/agent/calendar/calendarPendingStateLifecycle';
import { advanceCalendarConversationTurn } from '@/src/features/agent/calendar/calendarConversationContext';
import { resolveMoveEventReference } from '@/src/features/agent/calendar/calendarConversationEventMemory';
import {
  getPendingIntent,
  mergeTranscriptWithPendingIntent,
  setPendingIntentForClarification,
} from '@/src/features/agent/calendar/calendarPendingIntent';
import {
  getCalendarConversationSnapshot,
  isCalendarConflictDecisionState,
  isCalendarConversationAwaitingInput,
  isAwaitingCalendarConflictResolution,
} from '@/src/features/agent/calendar/calendarConversationState';
import { isExplicitDifferentCalendarCommand } from '@/src/features/agent/calendar/calendarPendingConflictEnrichment';
import { shouldClearStalePendingForNewCommand } from '@/src/features/agent/calendar/calendarNewCommandPendingClear';
import { enrichCalendarCommandTranscript } from '@/src/features/agent/calendar/calendarTranscriptEnrichment';
import { resolveDisambiguationSelection, inferCalendarDisambiguationLocale } from '@/src/features/agent/calendar/calendarEventDisambiguation';
import { getExecutiveCalendarTimezone } from '@/src/features/agent/calendar/calendarTimezone';
import { tryMergePendingCalendarDeleteReply } from '@/src/features/agent/calendar/calendarDeletePendingContext';
import { resolvePendingCalendarDeleteFromReply } from '@/src/features/agent/calendar/pendingCalendarDeleteSelection';
import { executeCalendarCreateEvent } from '@/src/features/agent/execution/calendarCreateEventExecutor';
import { executeCalendarDeleteEvent } from '@/src/features/agent/execution/calendarDeleteEventExecutor';
import { executeCalendarUpdateEvent } from '@/src/features/agent/execution/calendarUpdateEventExecutor';
import {
  createCalendarToolFailure,
  type CalendarToolResponse,
  type CalendarToolStatus,
} from '@/src/features/agent/execution/calendarToolContract';
import {
  getLastCalendarCommandOutcome,
  getPendingCalendarDeleteContext,
  getPendingCalendarUpdateContext,
  setLastCalendarCommandOutcome,
  setPendingCalendarDeleteContext,
  setPendingCalendarUpdateContext,
  ensureCalendarOperationLockReleasedIfStale,
  clearLastCalendarCommandOutcomeIfTranscriptChanged,
} from '@/src/features/agent/execution/calendarExecutionSession';
import {
  logCalendarIntentDetected,
  logCalendarTerminalReply,
  logCalendarToolSelected,
} from '@/src/features/agent/calendar/calendarExecutionDebugLog';
import {
  logCalendarExecutionBlocked,
  logCalendarMoveConversationIntercept,
  logCalendarMoveExecutorCalled,
  logCalendarMoveIntentDetected,
  logCalendarMoveStaleTerminalBlocked,
  logCalendarPendingActionExecuted,
} from '@/src/features/agent/calendar/calendarMoveTraceLogger';
import { logPendingActionResolved } from '@/src/features/agent/calendar/calendarPendingActionLogger';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import {
  assessCalendarMutationReadiness,
  buildCalendarMutationClarificationReply,
} from '@/src/features/agent/calendar/calendarAmbiguousCommandSafety';
import {
  ensurePendingUpdateContextHydrated,
  getStoredMoveClarificationCandidates,
  isAwaitingMoveEventClarification,
  resolveStoredMoveClarificationReply,
} from '@/src/features/agent/calendar/calendarMoveClarificationState';
import { isCalendarMoveUpdateSelectionState } from '@/src/features/agent/calendar/calendarMoveUpdateLifecycle';
import { extractCalendarUpdateParameters } from '@/src/features/agent/calendar/calendarUpdateIntentExtractor';
import { parseCalendarUpdateSchedule } from '@/src/features/agent/calendar/calendarUpdateScheduleParser';
import {
  buildClarificationQuestion,
  validateActionFields,
} from '@/src/features/agent/intent/actionFieldValidator';

export type CalendarCommandResult = {
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

function rememberCalendarCommandOutcome(
  outcome: {
    intent: CalendarCommandKind;
    tool: CalendarToolResponse;
    terminalReply: string;
    verified: boolean;
  },
  sourceTranscript: string,
) {
  setLastCalendarCommandOutcome({
    ...outcome,
    sourceTranscript: sourceTranscript.trim(),
  });
}

function buildCalendarClarificationResult(params: {
  intent: CalendarCommandKind;
  reply: string;
  sourceTranscript: string;
  referenceNow: Date;
  title?: string | null;
}): CalendarCommandResult {
  if (params.intent === 'create_calendar_event') {
    setPendingIntentForClarification({
      intent: 'CREATE_EVENT',
      title: params.title?.trim() || 'event',
      sourceTranscript: params.sourceTranscript,
    });
  } else if (params.intent === 'update_calendar_event') {
    setPendingIntentForClarification({
      intent: 'MOVE_EVENT',
      title:
        params.title?.trim() ||
        resolveMoveEventReference(params.referenceNow)?.title ||
        'event',
      sourceTranscript: params.sourceTranscript,
    });
  }

  rememberCalendarCommandOutcome(
    {
      intent: params.intent,
      tool: {
        status: 'FAILURE',
        verified: false,
        verificationFetched: false,
        errorCode: 'CALENDAR_DATE_PARSE_FAILED',
        error: params.reply,
      },
      terminalReply: params.reply,
      verified: false,
    },
    params.sourceTranscript,
  );

  return {
    matched: true,
    intent: params.intent,
    reply: params.reply,
    spokenReply: params.reply,
    toolStatus: 'FAILURE',
    executionState: 'tool_failure',
    verified: false,
  };
}

function isPendingDisambiguationSelectionFollowUp(params: {
  selectionTranscript: string;
  referenceNow: Date;
}) {
  const selectionTranscript = params.selectionTranscript.trim();

  if (!selectionTranscript) {
    return false;
  }

  const timeZone = getExecutiveCalendarTimezone();
  const deletePending = getPendingCalendarDeleteContext();

  if (deletePending?.selectedEventId) {
    return true;
  }

  if (deletePending?.candidates?.length) {
    if (
      resolveDisambiguationSelection({
        reply: selectionTranscript,
        candidates: deletePending.candidates,
        referenceNow: params.referenceNow,
        timeZone,
        pendingTitle: deletePending.title,
      })
    ) {
      return true;
    }
  }

  const updatePending = getPendingCalendarUpdateContext();

  if (updatePending?.selectedEventId) {
    return true;
  }

  const updateCandidates =
    updatePending?.candidates?.length
      ? updatePending.candidates
      : getStoredMoveClarificationCandidates();

  if (updateCandidates.length > 0) {
    if (
      resolveDisambiguationSelection({
        reply: selectionTranscript,
        candidates: updateCandidates,
        referenceNow: params.referenceNow,
        timeZone,
        locale: inferCalendarDisambiguationLocale({
          sourceTranscript:
            updatePending?.sourceTranscript ??
            getCalendarConversationSnapshot().pendingAction?.sourceTranscript,
        }),
        pendingTitle: updatePending?.title ?? getCalendarConversationSnapshot().pendingAction?.eventTitle,
      })
    ) {
      return true;
    }
  }

  return false;
}

async function tryRunPendingCalendarDeleteSelection(params: {
  selectionTranscript: string;
  languageCode: VoiceLanguageCode;
  referenceNow: Date;
}): Promise<CalendarCommandResult | null> {
  const pending = getPendingCalendarDeleteContext();

  if (!pending?.candidates?.length && !pending?.awaitingRecurringChoice) {
    return null;
  }

  const selectionTranscript = params.selectionTranscript.trim();

  if (!selectionTranscript) {
    return null;
  }

  let selectedEventId = pending.selectedEventId ?? null;

  if (pending.awaitingRecurringChoice) {
    const merged = tryMergePendingCalendarDeleteReply({
      pending,
      reply: selectionTranscript,
      referenceNow: params.referenceNow,
    });

    if (!merged?.selectedEventId) {
      return null;
    }

    setPendingCalendarDeleteContext(merged.context);
    selectedEventId = merged.selectedEventId;
  } else if (!selectedEventId) {
    const resolved = await resolvePendingCalendarDeleteFromReply({
      pending,
      reply: selectionTranscript,
      referenceNow: params.referenceNow,
    });

    if (!resolved) {
      return null;
    }

    setPendingCalendarDeleteContext(resolved.context);
    selectedEventId = resolved.selected.eventId;
  }

  logCalendarIntentDetected({
    transcript: selectionTranscript,
    intent: 'delete_calendar_event',
    requiresTool: true,
  });
  logCalendarToolSelected({ intent: 'delete_calendar_event', tool: 'google_calendar_delete_event' });

  const outcome = await executeCalendarDeleteEvent({
    transcript: pending.sourceTranscript,
    languageCode: params.languageCode,
    referenceNow: params.referenceNow,
    selectedEventId,
  });

  const contractOk = isVerifiedCalendarDeleteSuccess(outcome.tool);
  const terminalReply =
    outcome.tool.status === 'SUCCESS' && !contractOk
      ? buildFailureTerminalReply(
          'CALENDAR_EXECUTION_CONTRACT',
          'API reported success but verified delete confirmation is missing',
        )
      : outcome.reply;

  if (contractOk) {
    logPendingActionResolved({
      type: 'delete_event',
      selectedEventId,
      sourceTranscriptPreview: pending.sourceTranscript,
    });
  }

  rememberCalendarCommandOutcome(
    {
      intent: 'delete_calendar_event',
      tool: outcome.tool,
      terminalReply,
      verified: contractOk,
    },
    pending.sourceTranscript,
  );

  logCalendarTerminalReply({
    intent: 'delete_calendar_event',
    tool: outcome.tool,
    replyPreview: terminalReply,
  });

  return {
    matched: true,
    intent: 'delete_calendar_event',
    reply: terminalReply,
    spokenReply: outcome.spokenReply,
    toolStatus: contractOk ? 'SUCCESS' : outcome.tool.status === 'SUCCESS' ? 'FAILURE' : outcome.tool.status,
    executionState: contractOk ? 'tool_success' : mapExecutionState(outcome.tool.status),
    verified: contractOk,
    requiresCalendarAuth: outcome.requiresCalendarAuth,
    eventId: outcome.tool.eventId ?? null,
  };
}

async function tryRunPendingCalendarUpdateSelection(params: {
  selectionTranscript: string;
  languageCode: VoiceLanguageCode;
  referenceNow: Date;
}): Promise<CalendarCommandResult | null> {
  const conversationSnapshot = getCalendarConversationSnapshot();

  if (
    isAwaitingCalendarConflictResolution() ||
    isCalendarConflictDecisionState(conversationSnapshot.state)
  ) {
    return null;
  }

  if (
    !isCalendarMoveUpdateSelectionState(conversationSnapshot.state) &&
    getStoredMoveClarificationCandidates().length === 0
  ) {
    return null;
  }

  const selectionTranscript = params.selectionTranscript.trim();

  if (!selectionTranscript) {
    return null;
  }

  ensurePendingUpdateContextHydrated(params.referenceNow);

  const merged = resolveStoredMoveClarificationReply({
    reply: selectionTranscript,
    referenceNow: params.referenceNow,
  });

  if (!merged?.selectedEventId) {
    return null;
  }

  const selectedEventId = merged.selectedEventId;
  const sourceTranscript = merged.context.sourceTranscript.trim();

  logCalendarPendingActionExecuted({
    action: 'move',
    selectedEventId,
    sourceTranscript,
  });

  logCalendarIntentDetected({
    transcript: selectionTranscript,
    intent: 'update_calendar_event',
    requiresTool: true,
  });
  logCalendarToolSelected({ intent: 'update_calendar_event', tool: 'google_calendar_update_event' });

  const outcome = await executeCalendarUpdateEvent({
    transcript: sourceTranscript,
    languageCode: params.languageCode,
    referenceNow: params.referenceNow,
    selectedEventId,
  });

  const contractOk = isVerifiedCalendarUpdateSuccess(outcome.tool);
  const terminalReply =
    outcome.tool.status === 'SUCCESS' && !contractOk
      ? buildFailureTerminalReply(
          'CALENDAR_EXECUTION_CONTRACT',
          'API reported success but verified update confirmation is missing',
        )
      : outcome.reply;

  if (contractOk) {
    logPendingActionResolved({
      type: 'move_event',
      selectedEventId,
      sourceTranscriptPreview: sourceTranscript,
    });
  }

  rememberCalendarCommandOutcome(
    {
      intent: 'update_calendar_event',
      tool: outcome.tool,
      terminalReply,
      verified: contractOk,
    },
    sourceTranscript,
  );

  logCalendarTerminalReply({
    intent: 'update_calendar_event',
    tool: outcome.tool,
    replyPreview: terminalReply,
  });

  return {
    matched: true,
    intent: 'update_calendar_event',
    reply: terminalReply,
    spokenReply: outcome.spokenReply,
    toolStatus: contractOk ? 'SUCCESS' : outcome.tool.status === 'SUCCESS' ? 'FAILURE' : outcome.tool.status,
    executionState: contractOk ? 'tool_success' : mapExecutionState(outcome.tool.status),
    verified: contractOk,
    requiresCalendarAuth: outcome.requiresCalendarAuth,
    eventId: outcome.tool.eventId ?? null,
  };
}

function buildMoveExceptionCommandResult(params: {
  languageCode: VoiceLanguageCode;
  reason: string;
  transcript: string;
}): CalendarCommandResult {
  const tool = createCalendarToolFailure('CALENDAR_OPERATION_ERROR', params.reason);
  const reply = buildCalendarMoveExceptionReply(params.languageCode, params.reason);

  rememberCalendarCommandOutcome(
    {
      intent: 'update_calendar_event',
      tool,
      terminalReply: reply,
      verified: false,
    },
    params.transcript,
  );

  finalizeCalendarPendingStateAfterMutation({
    verified: false,
    tool,
    reason: 'update_exception',
    transcript: params.transcript,
  });

  return {
    matched: true,
    intent: 'update_calendar_event',
    reply,
    spokenReply: reply,
    toolStatus: 'FAILURE',
    executionState: 'tool_failure',
    verified: false,
  };
}

function mapExecutionState(status: CalendarToolStatus): AssistantExecutionState {
  if (status === 'SUCCESS') {
    return 'tool_success';
  }

  if (status === 'PENDING') {
    return 'tool_call';
  }

  return 'tool_failure';
}

export async function executeCalendarCommand(params: {
  transcript: string;
  languageCode: VoiceLanguageCode;
  calendarConnected: boolean;
  referenceNow: Date;
  /** Current user message only — CREATE titles are extracted from this, not merged history. */
  titleSourceTranscript?: string;
}): Promise<CalendarCommandResult> {
  try {
    return await executeCalendarCommandUnsafe(params);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'неизвестная ошибка';

    logCalendarMoveWorkflow('MOVE_EXCEPTION', {
      phase: 'executeCalendarCommand',
      reason,
      transcriptPreview: params.transcript.slice(0, 120),
    });

    if (
      requiresCalendarCommandExecution(params.transcript) &&
      detectCalendarCommandIntent(params.transcript) === 'update_calendar_event'
    ) {
      return buildMoveExceptionCommandResult({
        languageCode: params.languageCode,
        reason,
        transcript: params.transcript,
      });
    }

    throw error;
  }
}

async function executeCalendarCommandUnsafe(params: {
  transcript: string;
  languageCode: VoiceLanguageCode;
  calendarConnected: boolean;
  referenceNow: Date;
  titleSourceTranscript?: string;
}): Promise<CalendarCommandResult> {
  logCalendarMoveExecutorCalled({
    executor: 'executeCalendarCommand',
    transcript: params.transcript,
  });
  ensureCalendarOperationLockReleasedIfStale('executeCalendarCommand');
  clearLastCalendarCommandOutcomeIfTranscriptChanged(params.transcript);
  advanceCalendarConversationTurn();
  expirePendingCalendarStateIfStale(params.referenceNow);
  recoverStalePendingCalendarAction(params.transcript);

  const selectionTranscript = params.titleSourceTranscript?.trim() || params.transcript.trim();
  const pendingDeleteOutcome = await tryRunPendingCalendarDeleteSelection({
    selectionTranscript,
    languageCode: params.languageCode,
    referenceNow: params.referenceNow,
  });

  if (pendingDeleteOutcome) {
    return pendingDeleteOutcome;
  }

  const pendingUpdateOutcome = await tryRunPendingCalendarUpdateSelection({
    selectionTranscript,
    languageCode: params.languageCode,
    referenceNow: params.referenceNow,
  });

  if (pendingUpdateOutcome) {
    return pendingUpdateOutcome;
  }

  const selectionTranscriptForClear = params.titleSourceTranscript?.trim() || params.transcript.trim();
  const snapshotBeforeMerge = getCalendarConversationSnapshot();

  if (isCalendarConversationAwaitingInput()) {
    const preMergeClassification = classifyPendingCalendarReply(selectionTranscriptForClear);

    if (
      shouldClearMoveUpdateSelectionOnUnrelatedReply({
        conversationState: snapshotBeforeMerge.state,
        classification: preMergeClassification,
        validSelectionFollowUp: isPendingDisambiguationSelectionFollowUp({
          selectionTranscript: selectionTranscriptForClear,
          referenceNow: params.referenceNow,
        }),
      })
    ) {
      clearMoveUpdateWorkflowState('unrelated_message_clears_move_selection', selectionTranscriptForClear);
    }
  }

  const mergedWithPendingIntent = mergeTranscriptWithPendingIntent(params.transcript);

  const enrichedTranscript = enrichCalendarCommandTranscript({
    transcript: mergedWithPendingIntent,
    referenceNow: params.referenceNow,
  });

  if (isCalendarConversationAwaitingInput()) {
    const snapshot = getCalendarConversationSnapshot();
    const pending = snapshot.pendingAction;
    const pendingIntent = getPendingIntent();
    const classification = classifyPendingCalendarReply(enrichedTranscript);
    const inConflictDecision = isCalendarConflictDecisionState(snapshot.state);
    const preservesPendingSelection = isPendingDisambiguationSelectionFollowUp({
      selectionTranscript,
      referenceNow: params.referenceNow,
    });

    logPendingReplyClassified({
      transcript: enrichedTranscript,
      classification,
      pendingActionId: pending?.pendingActionId ?? null,
    });

    if (inConflictDecision) {
      if (isCalendarReadBypassDuringPendingConflict(params.transcript)) {
        return {
          matched: false,
          intent: 'none',
          reply: '',
          spokenReply: '',
          toolStatus: 'FAILURE',
          executionState: 'conversational',
          verified: false,
        };
      }

      const conversationTurn = await handleCalendarConversationTurn({
        transcript: params.transcript,
        languageCode: params.languageCode,
        referenceNow: params.referenceNow,
        titleSourceTranscript: params.titleSourceTranscript,
        calendarConnected: params.calendarConnected,
      });

      if (conversationTurn) {
        logCalendarMoveConversationIntercept({
          handled: true,
          reason: inConflictDecision ? 'conflict_decision_handler' : 'pending_conversation_turn',
          transcript: params.transcript,
        });
        return conversationTurn;
      }

      if (classification !== 'new_calendar_command') {
        const reminder =
          params.languageCode === 'uk-UA'
            ? 'Скажіть «так», «ні», час або «запропонуй інший час».'
            : params.languageCode === 'ru-RU'
              ? 'Скажите «да», «нет», время или «предложи другое время».'
              : 'Say "yes", "no", a time, or ask for another time.';

        return {
          matched: true,
          intent: 'create_calendar_event',
          reply: reminder,
          spokenReply: reminder,
          toolStatus: 'FAILURE',
          executionState: 'tool_failure',
          verified: false,
        };
      }
    }

    const overridesPending =
      !preservesPendingSelection &&
      (classification === 'new_calendar_command' || shouldClearStalePendingForNewCommand(enrichedTranscript, pending)) &&
      pending &&
      !pendingIntent &&
      (!inConflictDecision ||
        isExplicitDifferentCalendarCommand(enrichedTranscript, pending) ||
        shouldClearStalePendingForNewCommand(enrichedTranscript, pending));

    if (overridesPending) {
      logNewCommandOverridesPending({
        pendingActionId: pending.pendingActionId,
        transcript: enrichedTranscript,
      });
      clearPendingCalendarState('new_command_override', enrichedTranscript);
    } else if (!inConflictDecision) {
      const conversationTurn = await handleCalendarConversationTurn({
        transcript: enrichedTranscript,
        languageCode: params.languageCode,
        referenceNow: params.referenceNow,
        titleSourceTranscript: params.titleSourceTranscript,
        calendarConnected: params.calendarConnected,
      });

      if (conversationTurn) {
        logCalendarMoveConversationIntercept({
          handled: true,
          reason: inConflictDecision ? 'conflict_decision_handler' : 'pending_conversation_turn',
          transcript: params.transcript,
        });
        return conversationTurn;
      }
    }
  }

  const intent = detectCalendarCommandIntent(enrichedTranscript);

  logCalendarMoveIntentDetected({
    intent,
    transcript: enrichedTranscript,
    source: 'executeCalendarCommand',
  });

  logCalendarIntentDetected({
    transcript: params.transcript,
    intent,
    requiresTool: intent !== 'none',
  });

  if (intent === 'none') {
    const rawIntent = detectCalendarCommandIntent(params.transcript);

    if (rawIntent === 'update_calendar_event' && requiresCalendarCommandExecution(params.transcript)) {
      logCalendarMoveWorkflow('MOVE_EXCEPTION', {
        phase: 'intent_resolution',
        reason: 'enriched transcript lost update intent',
        rawTranscriptPreview: params.transcript.slice(0, 120),
        enrichedTranscriptPreview: enrichedTranscript.slice(0, 120),
      });

      return buildMoveExceptionCommandResult({
        languageCode: params.languageCode,
        reason: 'не удалось распознать команду переноса',
        transcript: params.transcript,
      });
    }

    return {
      matched: false,
      intent,
      reply: '',
      spokenReply: '',
      toolStatus: 'FAILURE',
      executionState: 'conversational',
      verified: false,
    };
  }

  if (intent === 'delete_calendar_event') {
    const deleteReadiness = assessCalendarMutationReadiness({
      transcript: enrichedTranscript,
      referenceNow: params.referenceNow,
      intent: 'delete_calendar_event',
    });

    if (!deleteReadiness.ready) {
      const clarification = buildCalendarMutationClarificationReply({
        readiness: deleteReadiness,
        languageCode: params.languageCode,
        intent: 'delete_calendar_event',
      });

      return buildCalendarClarificationResult({
        intent,
        reply: clarification,
        sourceTranscript: enrichedTranscript,
        referenceNow: params.referenceNow,
      });
    }

    logCalendarToolSelected({ intent, tool: 'google_calendar_delete_event' });

    const deletePending = getPendingCalendarDeleteContext();
    const outcome = await executeCalendarDeleteEvent({
      transcript: enrichedTranscript,
      languageCode: params.languageCode,
      referenceNow: params.referenceNow,
      selectedEventId: deletePending?.selectedEventId ?? null,
    });

    const contractOk = isVerifiedCalendarDeleteSuccess(outcome.tool);
    const terminalReply =
      outcome.tool.status === 'SUCCESS' && !contractOk
        ? buildFailureTerminalReply(
            'CALENDAR_EXECUTION_CONTRACT',
            'API reported success but verified delete confirmation is missing',
          )
        : outcome.reply;

    rememberCalendarCommandOutcome(
      {
        intent,
        tool: outcome.tool,
        terminalReply,
        verified: contractOk,
      },
      enrichedTranscript,
    );

    logCalendarTerminalReply({
      intent,
      tool: outcome.tool,
      replyPreview: terminalReply,
    });

    finalizeCalendarPendingStateAfterMutation({
      verified: contractOk,
      tool: outcome.tool,
      reason: 'delete_completed',
      transcript: enrichedTranscript,
    });

    return {
      matched: true,
      intent,
      reply: terminalReply,
      spokenReply: outcome.spokenReply,
      toolStatus: contractOk ? 'SUCCESS' : outcome.tool.status === 'SUCCESS' ? 'FAILURE' : outcome.tool.status,
      executionState: contractOk ? 'tool_success' : mapExecutionState(outcome.tool.status),
      verified: contractOk,
      requiresCalendarAuth: outcome.requiresCalendarAuth,
      eventId: outcome.tool.eventId ?? null,
    };
  }

  const toolName =
    intent === 'update_calendar_event'
      ? 'google_calendar_update_event'
      : 'google_calendar_create_event';

  logCalendarToolSelected({ intent, tool: toolName });

  if (intent === 'update_calendar_event') {
    if (isAwaitingMoveEventClarification()) {
      const selectionReply = selectionTranscript.trim();
      const resolved = resolveStoredMoveClarificationReply({
        reply: selectionReply,
        referenceNow: params.referenceNow,
      });

      if (resolved?.selectedEventId) {
        const outcome = await executeCalendarUpdateEvent({
          transcript: resolved.context.sourceTranscript.trim(),
          languageCode: params.languageCode,
          referenceNow: params.referenceNow,
          selectedEventId: resolved.selectedEventId,
        });

        const contractOk = isVerifiedCalendarUpdateSuccess(outcome.tool);
        const terminalReply = ensureVisibleCalendarMoveReply({
          reply:
            outcome.tool.status === 'SUCCESS' && !contractOk
              ? buildFailureTerminalReply(
                  'CALENDAR_EXECUTION_CONTRACT',
                  'API reported success but verified eventId is missing',
                )
              : outcome.reply,
          languageCode: params.languageCode,
          fallbackReason: 'пустой ответ инструмента переноса',
        });

        rememberCalendarCommandOutcome(
          {
            intent,
            tool: outcome.tool,
            terminalReply,
            verified: contractOk,
          },
          resolved.context.sourceTranscript.trim(),
        );

        finalizeCalendarPendingStateAfterMutation({
          verified: contractOk,
          tool: outcome.tool,
          reason: 'update_completed',
          transcript: resolved.context.sourceTranscript.trim(),
        });

        return {
          matched: true,
          intent,
          reply: terminalReply,
          spokenReply: ensureVisibleCalendarMoveReply({
            reply: outcome.spokenReply,
            languageCode: params.languageCode,
            fallbackReason: terminalReply,
          }),
          toolStatus: contractOk ? 'SUCCESS' : outcome.tool.status === 'SUCCESS' ? 'FAILURE' : outcome.tool.status,
          executionState: contractOk ? 'tool_success' : mapExecutionState(outcome.tool.status),
          verified: contractOk,
          requiresCalendarAuth: outcome.requiresCalendarAuth,
          eventId: outcome.tool.eventId ?? null,
        };
      }

      const reminder =
        params.languageCode === 'uk-UA'
          ? 'Уточніть, яке саме подію обрати.'
          : params.languageCode === 'ru-RU'
            ? 'Уточните, какое именно событие выбрать.'
            : 'Please clarify which event you mean.';

      return {
        matched: true,
        intent,
        reply: reminder,
        spokenReply: reminder,
        toolStatus: 'FAILURE',
        executionState: 'tool_failure',
        verified: false,
      };
    }

    const updateReadiness = assessCalendarMutationReadiness({
      transcript: enrichedTranscript,
      referenceNow: params.referenceNow,
      intent: 'update_calendar_event',
    });
    const extracted = extractCalendarUpdateParameters(enrichedTranscript, params.referenceNow);
    const schedule = parseCalendarUpdateSchedule(enrichedTranscript, params.referenceNow);
    const canAttemptUpdate =
      updateReadiness.ready || (Boolean(extracted.title) && schedule.ok);

    if (!canAttemptUpdate) {
      const clarification = buildCalendarMutationClarificationReply({
        readiness: updateReadiness,
        languageCode: params.languageCode,
        intent: 'update_calendar_event',
      });

      return buildCalendarClarificationResult({
        intent,
        reply: clarification,
        sourceTranscript: enrichedTranscript,
        referenceNow: params.referenceNow,
        title: extracted.title,
      });
    }

    const pendingUpdateSelection = getPendingCalendarUpdateContext();

    try {
      const outcome = await executeCalendarUpdateEvent({
        transcript: enrichedTranscript,
        languageCode: params.languageCode,
        referenceNow: params.referenceNow,
        selectedEventId: pendingUpdateSelection?.selectedEventId ?? null,
      });

      const contractOk = isVerifiedCalendarUpdateSuccess(outcome.tool);
      const terminalReply = ensureVisibleCalendarMoveReply({
        reply:
          outcome.tool.status === 'SUCCESS' && !contractOk
            ? buildFailureTerminalReply(
                'CALENDAR_EXECUTION_CONTRACT',
                'API reported success but verified eventId is missing',
              )
            : outcome.reply,
        languageCode: params.languageCode,
        fallbackReason: 'пустой ответ инструмента переноса',
      });
      const spokenReply = ensureVisibleCalendarMoveReply({
        reply: outcome.spokenReply,
        languageCode: params.languageCode,
        fallbackReason: terminalReply,
      });

      rememberCalendarCommandOutcome(
        {
          intent,
          tool: outcome.tool,
          terminalReply,
          verified: contractOk,
        },
        enrichedTranscript,
      );

      logCalendarTerminalReply({
        intent,
        tool: outcome.tool,
        replyPreview: terminalReply,
      });

      finalizeCalendarPendingStateAfterMutation({
        verified: contractOk,
        tool: outcome.tool,
        reason: 'update_completed',
        transcript: enrichedTranscript,
      });

      return {
        matched: true,
        intent,
        reply: terminalReply,
        spokenReply,
        toolStatus: contractOk ? 'SUCCESS' : outcome.tool.status === 'SUCCESS' ? 'FAILURE' : outcome.tool.status,
        executionState: contractOk ? 'tool_success' : mapExecutionState(outcome.tool.status),
        verified: contractOk,
        requiresCalendarAuth: outcome.requiresCalendarAuth,
        eventId: outcome.tool.eventId ?? null,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'неизвестная ошибка';

      logCalendarMoveWorkflow('MOVE_EXCEPTION', {
        phase: 'executeCalendarUpdateEvent',
        reason,
        transcriptPreview: enrichedTranscript.slice(0, 120),
      });

      return buildMoveExceptionCommandResult({
        languageCode: params.languageCode,
        reason,
        transcript: enrichedTranscript,
      });
    }
  }

  const extraction = extractCalendarCommand({
    transcript: enrichedTranscript,
    titleSourceTranscript: params.titleSourceTranscript ?? params.transcript,
    referenceNow: params.referenceNow,
  });

  if (!isCalendarExtractionExecutable(extraction)) {
    const createReadiness = assessCalendarMutationReadiness({
      transcript: enrichedTranscript,
      referenceNow: params.referenceNow,
      intent: 'create_calendar_event',
    });

    if (createReadiness.ready) {
      const outcome = await executeCalendarCreateEvent({
        transcript: enrichedTranscript,
        titleSourceTranscript: params.titleSourceTranscript ?? params.transcript,
        languageCode: params.languageCode,
        calendarConnected: params.calendarConnected,
        referenceNow: params.referenceNow,
      });

      const contractOk = isVerifiedCalendarCreateSuccess(outcome.tool);
      const terminalReply =
        outcome.tool.status === 'SUCCESS' && !contractOk
          ? buildFailureTerminalReply(
              'CALENDAR_EXECUTION_CONTRACT',
              'API reported success but verified eventId is missing',
            )
          : outcome.reply;

      rememberCalendarCommandOutcome(
        {
          intent,
          tool: outcome.tool,
          terminalReply,
          verified: contractOk,
        },
        enrichedTranscript,
      );

      return {
        matched: true,
        intent,
        reply: terminalReply,
        spokenReply: outcome.spokenReply,
        toolStatus: outcome.tool.status,
        executionState: contractOk
          ? 'tool_success'
          : outcome.tool.status === 'PENDING'
            ? 'tool_call'
            : 'tool_failure',
        verified: contractOk,
        requiresCalendarAuth: outcome.requiresCalendarAuth,
        eventId: outcome.tool.eventId ?? null,
      };
    }

    const validation = validateActionFields({
      transcript: enrichedTranscript,
      referenceNow: params.referenceNow,
    });
    const failureReply = createReadiness.ready
      ? buildClarificationQuestion({
          missingFields: validation.missingFields,
          languageCode: params.languageCode,
        })
      : buildCalendarMutationClarificationReply({
          readiness: createReadiness,
          languageCode: params.languageCode,
          intent: 'create_calendar_event',
        });

    if (intent === 'create_calendar_event') {
      setPendingIntentForClarification({
        intent: 'CREATE_EVENT',
        title: extraction.title?.trim() || 'event',
        sourceTranscript: enrichedTranscript,
      });
    }

    return buildCalendarClarificationResult({
      intent,
      reply: failureReply,
      sourceTranscript: enrichedTranscript,
      referenceNow: params.referenceNow,
      title: extraction.title,
    });
  }

  const outcome = await executeCalendarCreateEvent({
    transcript: enrichedTranscript,
    titleSourceTranscript: params.titleSourceTranscript ?? params.transcript,
    languageCode: params.languageCode,
    calendarConnected: params.calendarConnected,
    referenceNow: params.referenceNow,
  });

  const contractOk = isVerifiedCalendarCreateSuccess(outcome.tool);
  const terminalReply =
    outcome.tool.status === 'SUCCESS' && !contractOk
      ? buildFailureTerminalReply(
          'CALENDAR_EXECUTION_CONTRACT',
          'API reported success but verified eventId is missing',
        )
      : outcome.reply;

  rememberCalendarCommandOutcome(
    {
      intent,
      tool: outcome.tool,
      terminalReply,
      verified: contractOk,
    },
    enrichedTranscript,
  );

  logCalendarTerminalReply({
    intent,
    tool: outcome.tool,
    replyPreview: terminalReply,
  });

  finalizeCalendarPendingStateAfterMutation({
    verified: contractOk,
    tool: outcome.tool,
    reason: 'create_completed',
    transcript: enrichedTranscript,
  });

  return {
    matched: true,
    intent,
    reply: terminalReply,
    spokenReply: outcome.spokenReply,
    toolStatus: contractOk ? 'SUCCESS' : outcome.tool.status === 'SUCCESS' ? 'FAILURE' : outcome.tool.status,
    executionState: contractOk ? 'tool_success' : mapExecutionState(outcome.tool.status),
    verified: contractOk,
    requiresCalendarAuth: outcome.requiresCalendarAuth,
    eventId: outcome.tool.eventId ?? null,
  };
}

export function getCalendarCommandTerminalReply(userTranscript: string) {
  const intent = detectCalendarCommandIntent(userTranscript);

  if (intent === 'none') {
    return null;
  }

  const last = getLastCalendarCommandOutcome();
  const normalized = userTranscript.trim();

  if (last && last.intent === intent) {
    if (last.sourceTranscript && last.sourceTranscript.trim() !== normalized) {
      logCalendarMoveStaleTerminalBlocked({
        requestedTranscript: normalized,
        staleTranscript: last.sourceTranscript,
        intent,
      });
      return null;
    }

    return last.terminalReply;
  }

  return buildFailureTerminalReply(
    'CALENDAR_EXECUTION_CONTRACT',
    'calendar command required tool execution but no terminal tool result is available',
  );
}
