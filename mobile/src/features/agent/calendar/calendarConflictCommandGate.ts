import type { AssistantExecutionState } from '@/src/features/agent/conversation/assistantExecutionObservability';
import type { CalendarCommandKind } from '@/src/features/agent/calendar/calendarCommandTypes';
import type { CalendarToolStatus } from '@/src/features/agent/execution/calendarToolContract';
import {
  buildCalendarConflictAlternativesOnlyReply,
  buildCalendarUpdateConflictAlternativesOnlyReply,
  buildCalendarConflictCancelledReply,
  formatConflictSlotLabelWithDay,
  resolveConflictDayOffset,
} from '@/src/features/agent/calendar/calendarConflictReplies';
import { syncConversationStateForConflictAlternatives } from '@/src/features/agent/calendar/calendarConversationSync';
import { conflictContextToPendingAction } from '@/src/features/agent/calendar/calendarConversationSync';
import {
  markPendingConflictProceed,
  resolveCalendarConflictFollowUp,
} from '@/src/features/agent/calendar/calendarConflictPendingContext';
import { resolveStoredUpdateTargetFromPending } from '@/src/features/agent/calendar/calendarPendingConflictTarget';
import { executeCalendarCreateEvent } from '@/src/features/agent/execution/calendarCreateEventExecutor';
import { executeCalendarUpdateEvent } from '@/src/features/agent/execution/calendarUpdateEventExecutor';
import {
  createCalendarToolFailure,
} from '@/src/features/agent/execution/calendarToolContract';
import {
  isVerifiedCalendarCreateSuccess,
  isVerifiedCalendarUpdateSuccess,
} from '@/src/features/agent/calendar/calendarExecutionContract';
import {
  clearPendingCalendarConflictContext,
  getPendingCalendarConflictContext,
  setPendingCalendarConflictContext,
} from '@/src/features/agent/execution/calendarExecutionSession';
import { normalizeCalendarEvents } from '@/src/features/agent/calendarIntelligence/normalizeEvents';
import { getFreeWindows } from '@/src/features/agent/calendarIntelligence/scheduleHelpers';
import { fetchTimedEventsNearScheduleWindow } from '@/src/features/agent/calendar/calendarScheduleConflict';
import { parseGoogleCalendarInstant } from '@/src/features/agent/calendar/calendarTime';
import { getExecutiveCalendarTimezone } from '@/src/features/agent/calendar/calendarTimezone';
import { getChatLocaleFromVoiceLanguage } from '@/src/features/chat/services/voiceLanguage';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { finalizeCalendarPendingStateAfterMutation } from '@/src/features/agent/calendar/calendarPendingStateLifecycle';
import { setLastCalendarCommandOutcome } from '@/src/features/agent/execution/calendarExecutionSession';
import { formatDateKey } from '@/src/features/agent/calendarIntelligence/zonedEventTime';
import {
  addDaysToZonedYmd,
  getZonedDayRange,
  getZonedYmd,
} from '@/src/features/agent/calendar/calendarTimezone';

export type CalendarConflictCommandResult = {
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

function mapVerifiedOutcome(params: {
  intent: CalendarCommandKind;
  tool: Awaited<ReturnType<typeof executeCalendarCreateEvent>>['tool'];
  reply: string;
  spokenReply: string;
  verified: boolean;
  requiresCalendarAuth?: boolean;
  eventId?: string | null;
}): CalendarConflictCommandResult {
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

async function buildFreeSlotsReplyForPending(
  pending: NonNullable<ReturnType<typeof getPendingCalendarConflictContext>>,
): Promise<{ reply: string; alternativeStartMs: number[] }> {
  const locale = getChatLocaleFromVoiceLanguage(pending.languageCode);
  const timeZone = getExecutiveCalendarTimezone();
  const referenceNow = new Date();
  const dayOffset = resolveConflictDayOffset(pending.proposedStartMs, referenceNow);
  const range = getZonedDayRange(referenceNow, dayOffset, timeZone);
  const targetYmd = addDaysToZonedYmd(getZonedYmd(referenceNow, timeZone), dayOffset);
  const adjustedDay = {
    dateKey: formatDateKey(targetYmd),
    dayOffset,
    range,
    timezone: timeZone,
  };

  const { events, fetchOk } = await fetchTimedEventsNearScheduleWindow({
    referenceNow,
    proposedStartMs: pending.proposedStartMs,
    proposedEndMs: pending.proposedEndMs,
  });

  if (!fetchOk) {
    return {
      reply: 'Could not refresh the calendar to suggest free slots.',
      alternativeStartMs: [],
    };
  }

  const normalized = normalizeCalendarEvents(events, timeZone);
  const durationMinutes = Math.max(
    15,
    Math.round((pending.proposedEndMs - pending.proposedStartMs) / 60_000),
  );
  const slots = getFreeWindows(normalized, adjustedDay, referenceNow, durationMinutes);
  const alternativeStartMs = slots
    .slice(0, 3)
    .map((slot) => parseGoogleCalendarInstant(slot.startISO) ?? 0)
    .filter((value) => value > 0);
  const optionLabels = slots
    .slice(0, 3)
    .map((slot) =>
      formatConflictSlotLabelWithDay({
        slot,
        referenceNow,
        locale,
        timeZone,
      }),
    );

  return {
    reply:
      pending.operation === 'update'
        ? buildCalendarUpdateConflictAlternativesOnlyReply({
            locale,
            proposedTitle: pending.proposedTitle,
            optionLabels,
          })
        : buildCalendarConflictAlternativesOnlyReply({
            locale,
            optionLabels,
          }),
    alternativeStartMs,
  };
}

export async function handleCalendarConflictFollowUp(params: {
  transcript: string;
  languageCode: VoiceLanguageCode;
  referenceNow: Date;
  titleSourceTranscript?: string;
  calendarConnected: boolean;
}): Promise<CalendarConflictCommandResult | null> {
  const pending = getPendingCalendarConflictContext();

  if (!pending) {
    return null;
  }

  const followUp = resolveCalendarConflictFollowUp(params.transcript);
  const locale = getChatLocaleFromVoiceLanguage(pending.languageCode);

  if (followUp?.kind === 'cancel') {
    clearPendingCalendarConflictContext();
    const reply = buildCalendarConflictCancelledReply(locale);

    return mapVerifiedOutcome({
      intent: pending.operation === 'update' ? 'update_calendar_event' : 'create_calendar_event',
      tool: createCalendarToolFailure('CALENDAR_SCHEDULE_CONFLICT', 'User cancelled after conflict'),
      reply,
      spokenReply: reply,
      verified: false,
    });
  }

  if (followUp?.kind === 'suggest_slots') {
    const slotResult = await buildFreeSlotsReplyForPending(pending);
    syncConversationStateForConflictAlternatives(pending, slotResult.alternativeStartMs);

    return mapVerifiedOutcome({
      intent: pending.operation === 'update' ? 'update_calendar_event' : 'create_calendar_event',
      tool: createCalendarToolFailure('CALENDAR_SCHEDULE_CONFLICT', 'Awaiting conflict confirmation'),
      reply: slotResult.reply,
      spokenReply: slotResult.reply,
      verified: false,
    });
  }

  if (followUp?.kind === 'proceed') {
    if (pending.operation === 'update') {
      const pendingAction = conflictContextToPendingAction(pending);
      const storedUpdateTarget = resolveStoredUpdateTargetFromPending(pendingAction);

      const outcome = await executeCalendarUpdateEvent({
        transcript: pending.sourceTranscript,
        languageCode: pending.languageCode,
        referenceNow: params.referenceNow,
        skipScheduleConflictCheck: true,
        storedUpdateTarget: storedUpdateTarget ?? undefined,
      });

      clearPendingCalendarConflictContext();

      const verified = isVerifiedCalendarUpdateSuccess(outcome.tool);

      finalizeCalendarPendingStateAfterMutation({
        verified,
        tool: outcome.tool,
        reason: 'update_completed',
        transcript: pending.sourceTranscript,
      });

      return mapVerifiedOutcome({
        intent: 'update_calendar_event',
        tool: outcome.tool,
        reply: outcome.reply,
        spokenReply: outcome.spokenReply,
        verified,
        requiresCalendarAuth: outcome.requiresCalendarAuth,
        eventId: outcome.tool.eventId ?? null,
      });
    }

    setPendingCalendarConflictContext(markPendingConflictProceed(pending));

    const outcome = await executeCalendarCreateEvent({
      transcript: pending.sourceTranscript,
      titleSourceTranscript: pending.titleSourceTranscript ?? pending.sourceTranscript,
      languageCode: pending.languageCode,
      calendarConnected: params.calendarConnected,
      referenceNow: params.referenceNow,
      skipScheduleConflictCheck: true,
    });

    clearPendingCalendarConflictContext();

    const verified = isVerifiedCalendarCreateSuccess(outcome.tool);

    finalizeCalendarPendingStateAfterMutation({
      verified,
      tool: outcome.tool,
      reason: 'create_completed',
      transcript: pending.sourceTranscript,
    });

    return mapVerifiedOutcome({
      intent: 'create_calendar_event',
      tool: outcome.tool,
      reply: outcome.reply,
      spokenReply: outcome.spokenReply,
      verified,
      requiresCalendarAuth: outcome.requiresCalendarAuth,
      eventId: outcome.tool.eventId ?? null,
    });
  }

  if (pending.proceedDespiteConflict) {
    return null;
  }

  const reminder =
    locale === 'uk'
      ? 'Скажіть «так», щоб продовжити, «ні», щоб скасувати, або «запропонуй інший час».'
      : locale === 'ru'
        ? 'Скажите «да», чтобы продолжить, «нет», чтобы отменить, или «предложи другое время».'
        : 'Say "yes" to proceed, "no" to cancel, or ask for another time.';

  return mapVerifiedOutcome({
    intent: pending.operation === 'update' ? 'update_calendar_event' : 'create_calendar_event',
    tool: createCalendarToolFailure('CALENDAR_SCHEDULE_CONFLICT', 'Awaiting conflict confirmation'),
    reply: reminder,
    spokenReply: reminder,
    verified: false,
  });
}
