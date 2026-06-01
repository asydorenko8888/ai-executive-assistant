import type { AssistantExecutionState } from '@/src/features/agent/conversation/assistantExecutionObservability';
import type { CalendarCommandKind } from '@/src/features/agent/calendar/calendarCommandTypes';
import { cancelCalendarConversation } from '@/src/features/agent/calendar/calendarConversationCancel';
import {
  buildCalendarConflictFreeSlotsReply,
  resolveConflictDayOffset,
} from '@/src/features/agent/calendar/calendarConflictReplies';
import {
  buildTranscriptFromPendingDeleteContext,
  tryMergePendingCalendarDeleteReply,
} from '@/src/features/agent/calendar/calendarDeletePendingContext';
import {
  buildTranscriptFromPendingContext,
  tryMergePendingCalendarUpdateReply,
} from '@/src/features/agent/calendar/calendarUpdatePendingContext';
import { classifyCalendarShortReply } from '@/src/features/agent/calendar/calendarShortReply';
import {
  getCalendarConversationSnapshot,
  logCalendarConversationEvent,
  mapPendingActionTypeToCommandIntent,
  resetCalendarConversationState,
  transitionCalendarConversationState,
  type CalendarConversationState,
  type CalendarPendingAction,
} from '@/src/features/agent/calendar/calendarConversationState';
import { syncConversationStateForConflictAlternatives } from '@/src/features/agent/calendar/calendarConversationSync';
import { fetchTimedEventsNearScheduleWindow } from '@/src/features/agent/calendar/calendarScheduleConflict';
import { executeCalendarCreateEvent } from '@/src/features/agent/execution/calendarCreateEventExecutor';
import { executeCalendarUpdateEvent } from '@/src/features/agent/execution/calendarUpdateEventExecutor';
import { executeCalendarDeleteEvent } from '@/src/features/agent/execution/calendarDeleteEventExecutor';
import {
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
import { getFreeWindows } from '@/src/features/agent/calendarIntelligence/scheduleHelpers';
import { formatDateKey } from '@/src/features/agent/calendarIntelligence/zonedEventTime';
import {
  addDaysToZonedYmd,
  getExecutiveCalendarTimezone,
  getZonedDayRange,
  getZonedTimeParts,
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

async function buildAlternativeSlotsReply(pending: CalendarPendingAction) {
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
    };
  }

  const normalized = normalizeCalendarEvents(events, timeZone);
  const durationMinutes = Math.max(
    15,
    Math.round((pending.requestedEndMs - pending.requestedStartMs) / 60_000),
  );
  const slots = getFreeWindows(normalized, day, referenceNow, durationMinutes);
  const alternativeStartMs = slots
    .slice(0, 3)
    .map((slot) => parseGoogleCalendarInstant(slot.startISO) ?? 0)
    .filter((value) => value > 0);

  return {
    reply: buildCalendarConflictFreeSlotsReply({
      locale,
      slots,
      durationMinutes,
      dayOffset,
    }),
    alternativeStartMs,
  };
}

function resolvePickedAlternativeStartMs(reply: string, alternatives: number[]) {
  const normalized = reply.trim();
  const indexMatch = normalized.match(/^(\d{1,2})$/);

  if (indexMatch) {
    const index = Number(indexMatch[1]) - 1;

    if (index >= 0 && index < alternatives.length) {
      return alternatives[index];
    }
  }

  for (const startMs of alternatives) {
    const parts = getZonedTimeParts(new Date(startMs), getExecutiveCalendarTimezone());
    const hour = parts.hour;
    const minute = parts.minute;
    const patterns = [
      new RegExp(`\\b${hour}(?::${String(minute).padStart(2, '0')})?\\b`),
      new RegExp(`\\b${hour}\\s*(?:pm|am)\\b`, 'i'),
    ];

    if (patterns.some((pattern) => pattern.test(normalized))) {
      return startMs;
    }
  }

  return null;
}

function buildTimePhraseFromStartMs(startMs: number) {
  const timeZone = getExecutiveCalendarTimezone();
  const parts = getZonedTimeParts(new Date(startMs), timeZone);
  const pad = (value: number) => String(value).padStart(2, '0');
  const dayOffset = resolveConflictDayOffset(startMs, new Date());

  if (dayOffset === 1) {
    return `tomorrow at ${pad(parts.hour)}:${pad(parts.minute)}`;
  }

  if (dayOffset === 2) {
    return `the day after tomorrow at ${pad(parts.hour)}:${pad(parts.minute)}`;
  }

  const hour12 = parts.hour % 12 || 12;
  const meridiem = parts.hour >= 12 ? 'PM' : 'AM';
  const clock = parts.minute > 0 ? `${hour12}:${pad(parts.minute)}` : `${hour12}`;

  return `at ${clock} ${meridiem}`;
}

function buildRetriedTranscript(pending: CalendarPendingAction, timePhrase: string) {
  const title = pending.eventTitle.trim();

  if (pending.action === 'CREATE_EVENT') {
    return `Add ${title} ${timePhrase}`.replace(/\s+/g, ' ').trim();
  }

  if (pending.action === 'UPDATE_EVENT') {
    return `Move ${title} ${timePhrase}`.replace(/\s+/g, ' ').trim();
  }

  return `${pending.sourceTranscript} ${timePhrase}`.replace(/\s+/g, ' ').trim();
}

function conflictAwaitingReminder(languageCode: VoiceLanguageCode) {
  const locale = getChatLocaleFromVoiceLanguage(languageCode);

  if (locale === 'uk') {
    return 'Скажіть «так», «ні» або «запропонуй інший час».';
  }

  if (locale === 'ru') {
    return 'Скажите «да», «нет» или «предложи другое время».';
  }

  return 'Say "yes", "no", or ask for another time.';
}

async function executePendingMutation(params: {
  pending: CalendarPendingAction;
  referenceNow: Date;
  calendarConnected: boolean;
  skipScheduleConflictCheck?: boolean;
  transcriptOverride?: string;
}) {
  const transcript = params.transcriptOverride ?? params.pending.sourceTranscript;
  const intent = mapPendingActionTypeToCommandIntent(params.pending.action);

  if (params.pending.action === 'DELETE_EVENT') {
    const outcome = await executeCalendarDeleteEvent({
      transcript,
      languageCode: params.pending.languageCode,
      referenceNow: params.referenceNow,
    });

    resetCalendarConversationState('delete_completed', transcript);

    return mapOutcome({
      intent,
      tool: outcome.tool,
      reply: outcome.reply,
      spokenReply: outcome.spokenReply,
      verified: isVerifiedCalendarDeleteSuccess(outcome.tool),
      requiresCalendarAuth: outcome.requiresCalendarAuth,
      eventId: outcome.tool.eventId ?? null,
    });
  }

  if (params.pending.action === 'UPDATE_EVENT') {
    const outcome = await executeCalendarUpdateEvent({
      transcript,
      languageCode: params.pending.languageCode,
      referenceNow: params.referenceNow,
      skipScheduleConflictCheck: params.skipScheduleConflictCheck,
    });

    resetCalendarConversationState('update_completed', transcript);

    return mapOutcome({
      intent,
      tool: outcome.tool,
      reply: outcome.reply,
      spokenReply: outcome.spokenReply,
      verified: isVerifiedCalendarUpdateSuccess(outcome.tool),
      requiresCalendarAuth: outcome.requiresCalendarAuth,
      eventId: outcome.tool.eventId ?? null,
    });
  }

  const outcome = await executeCalendarCreateEvent({
    transcript,
    titleSourceTranscript: params.pending.titleSourceTranscript ?? transcript,
    languageCode: params.pending.languageCode,
    calendarConnected: params.calendarConnected,
    referenceNow: params.referenceNow,
    skipScheduleConflictCheck: params.skipScheduleConflictCheck,
  });

  resetCalendarConversationState('create_completed', transcript);

  return mapOutcome({
    intent,
    tool: outcome.tool,
    reply: outcome.reply,
    spokenReply: outcome.spokenReply,
    verified: isVerifiedCalendarCreateSuccess(outcome.tool),
    requiresCalendarAuth: outcome.requiresCalendarAuth,
    eventId: outcome.tool.eventId ?? null,
  });
}

async function handleConflictOrNewTimeState(params: {
  state: CalendarConversationState;
  pending: CalendarPendingAction;
  transcript: string;
  referenceNow: Date;
  calendarConnected: boolean;
}) {
  const short = classifyCalendarShortReply(params.transcript);
  const intent = mapPendingActionTypeToCommandIntent(params.pending.action);

  if (short === 'cancel') {
    return cancelPendingOperation(params.pending, params.transcript);
  }

  if (short === 'suggest_new_time' && params.state === 'WAITING_CONFLICT_CONFIRMATION') {
    const slotResult = await buildAlternativeSlotsReply(params.pending);
    const conflictLegacy = getPendingCalendarConflictContext();

    if (conflictLegacy) {
      syncConversationStateForConflictAlternatives(conflictLegacy, slotResult.alternativeStartMs);
    } else {
      transitionCalendarConversationState({
        toState: 'WAITING_NEW_TIME',
        pendingAction: {
          ...params.pending,
          alternativeStartMs: slotResult.alternativeStartMs,
        },
        reason: 'user_requested_alternatives',
        incomingMessage: params.transcript,
      });
    }

    return mapOutcome({
      intent,
      tool: createCalendarToolFailure('CALENDAR_SCHEDULE_CONFLICT', 'Awaiting alternative time selection'),
      reply: slotResult.reply,
      spokenReply: slotResult.reply,
      verified: false,
    });
  }

  const alternatives = params.pending.alternativeStartMs ?? [];

  if (params.state === 'WAITING_NEW_TIME') {
    const pickedStartMs = resolvePickedAlternativeStartMs(params.transcript, alternatives);

    if (pickedStartMs) {
      const retriedTranscript = buildRetriedTranscript(
        params.pending,
        buildTimePhraseFromStartMs(pickedStartMs),
      );

      return executePendingMutation({
        pending: params.pending,
        referenceNow: params.referenceNow,
        calendarConnected: params.calendarConnected,
        transcriptOverride: retriedTranscript,
      });
    }

    if (short === 'proceed') {
      return executePendingMutation({
        pending: params.pending,
        referenceNow: params.referenceNow,
        calendarConnected: params.calendarConnected,
        skipScheduleConflictCheck: true,
      });
    }
  }

  if (short === 'proceed') {
    return executePendingMutation({
      pending: params.pending,
      referenceNow: params.referenceNow,
      calendarConnected: params.calendarConnected,
      skipScheduleConflictCheck: true,
    });
  }

  const reminder = conflictAwaitingReminder(params.pending.languageCode);

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
}) {
  const short = classifyCalendarShortReply(params.transcript);

  if (short === 'cancel') {
    return cancelPendingOperation(params.pending, params.transcript);
  }

  const deletePending = getPendingCalendarDeleteContext();

  if (deletePending) {
    const merged = tryMergePendingCalendarDeleteReply({
      pending: deletePending,
      reply: params.transcript,
    });

    if (merged) {
      setPendingCalendarDeleteContext(merged.context);

      return executePendingMutation({
        pending: { ...params.pending, sourceTranscript: merged.transcript },
        referenceNow: params.referenceNow,
        calendarConnected: true,
        transcriptOverride: merged.transcript,
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

  const combined = `${params.pending.sourceTranscript} ${params.transcript}`.replace(/\s+/g, ' ').trim();

  return executePendingMutation({
    pending: { ...params.pending, sourceTranscript: combined },
    referenceNow: params.referenceNow,
    calendarConnected: true,
    transcriptOverride: combined,
  });
}

async function handleMoveConfirmation(params: {
  pending: CalendarPendingAction;
  transcript: string;
  referenceNow: Date;
  calendarConnected: boolean;
}) {
  const short = classifyCalendarShortReply(params.transcript);

  if (short === 'cancel') {
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

      return executePendingMutation({
        pending: { ...params.pending, sourceTranscript: merged.transcript },
        referenceNow: params.referenceNow,
        calendarConnected: params.calendarConnected,
        transcriptOverride: merged.transcript,
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

  const combined = `${params.pending.sourceTranscript} ${params.transcript}`.replace(/\s+/g, ' ').trim();

  return executePendingMutation({
    pending: { ...params.pending, sourceTranscript: combined },
    referenceNow: params.referenceNow,
    calendarConnected: params.calendarConnected,
    transcriptOverride: combined,
  });
}

export async function handleCalendarConversationTurn(params: {
  transcript: string;
  languageCode: VoiceLanguageCode;
  referenceNow: Date;
  titleSourceTranscript?: string;
  calendarConnected: boolean;
}): Promise<CalendarConversationTurnResult | null> {
  const snapshot = getCalendarConversationSnapshot();

  if (snapshot.state === 'IDLE' || !snapshot.pendingAction) {
    return null;
  }

  const pending = snapshot.pendingAction;

  logCalendarConversationEvent({
    event: 'incoming',
    incomingMessage: params.transcript,
    toState: snapshot.state,
    pendingAction: pending,
  });

  let result: CalendarConversationTurnResult;

  switch (snapshot.state) {
    case 'WAITING_CONFLICT_CONFIRMATION':
    case 'WAITING_NEW_TIME':
      result = await handleConflictOrNewTimeState({
        state: snapshot.state,
        pending,
        transcript: params.transcript,
        referenceNow: params.referenceNow,
        calendarConnected: params.calendarConnected,
      });
      break;
    case 'WAITING_DELETE_CONFIRMATION':
    case 'WAITING_EVENT_SELECTION':
      result = await handleDeleteOrSelectionState({
        pending,
        transcript: params.transcript,
        referenceNow: params.referenceNow,
      });
      break;
    case 'WAITING_MOVE_CONFIRMATION':
      result = await handleMoveConfirmation({
        pending,
        transcript: params.transcript,
        referenceNow: params.referenceNow,
        calendarConnected: params.calendarConnected,
      });
      break;
    default:
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
