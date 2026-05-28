import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { getChatLocaleFromVoiceLanguage } from '@/src/features/chat/services/voiceLanguage';
import { createGoogleCalendarEvent } from '@/src/features/agent/calendar/googleCalendarWriteService';
import { resolveCalendarWriteAccessState } from '@/src/features/agent/calendar/calendarWriteAccess';
import { buildCalendarAuthRequiredReply } from '@/src/features/agent/calendar/calendarOAuthExecutionService';
import {
  buildCalendarCreateEventPayload,
  formatVerifiedEventScheduleLabel,
} from '@/src/features/agent/execution/calendarEventPayloadBuilder';
import type { ActionExecutionResult } from '@/src/features/agent/execution/actionExecutionTypes';
import { logActionExecution } from '@/src/features/agent/execution/actionExecutionLogger';
import { assertNoFakeOperationalSuccess } from '@/src/features/agent/execution/operationalExecutionHonesty';
import { enqueueCalendarCreateAction } from '@/src/features/agent/execution/pendingActionQueue';
import type { CalendarOperationalUxPhase } from '@/src/features/agent/calendar/calendarOAuthExecutionService';

export type CalendarCreateExecutionParams = {
  transcript: string;
  languageCode: VoiceLanguageCode;
  calendarConnected: boolean;
  referenceNow: Date;
};

export type CalendarCreateExecutionOutcome = {
  result: ActionExecutionResult;
  reply: string;
  scheduleIso?: string | null;
  requiresCalendarAuth?: boolean;
  operationalUxPhase?: CalendarOperationalUxPhase;
  pendingActionId?: string;
};

function buildDateParseFailureReply(languageCode: VoiceLanguageCode) {
  const locale = getChatLocaleFromVoiceLanguage(languageCode);

  if (locale === 'uk') {
    return 'Зрозумів запит у календар, але не зміг розібрати час. Напиши, будь ласка, «завтра о 9:00» або точну дату.';
  }

  if (locale === 'ru') {
    return 'Понял календарный запрос, но не смог разобрать время. Напиши, пожалуйста, «завтра в 9:00» или точную дату.';
  }

  return 'I understood the calendar request but could not parse the date. Try tomorrow at 9:00 AM or an exact date.';
}

function buildSuccessReply(
  languageCode: VoiceLanguageCode,
  event: NonNullable<ActionExecutionResult['event']>,
) {
  const locale = getChatLocaleFromVoiceLanguage(languageCode);
  const { dayLine, timeLine, locationLine } = formatVerifiedEventScheduleLabel(event, languageCode);
  const lines = [
    event.summary,
    dayLine,
    timeLine,
  ];

  if (locationLine) {
    lines.push(locationLine);
  }

  lines.push(`Google event id: ${event.id}`);

  if (locale === 'uk') {
    return `Зустріч створено:\n${lines.join('\n')}`;
  }

  if (locale === 'ru') {
    return `Встреча создана:\n${lines.join('\n')}`;
  }

  return `Meeting created:\n${lines.join('\n')}`;
}

function buildFailureReply(languageCode: VoiceLanguageCode, errorMessage: string) {
  const locale = getChatLocaleFromVoiceLanguage(languageCode);

  if (locale === 'uk') {
    return `Не вдалося створити подію:\n${errorMessage}`;
  }

  if (locale === 'ru') {
    return `Не удалось создать встречу:\n${errorMessage}`;
  }

  return `Could not create the meeting:\n${errorMessage}`;
}

export async function executeCalendarCreateEvent(
  params: CalendarCreateExecutionParams,
): Promise<CalendarCreateExecutionOutcome> {
  logActionExecution('intent_detected', {
    tool: 'google_calendar_create_event',
    transcriptPreview: params.transcript.slice(0, 120),
  });

  logActionExecution('tool_selected', { tool: 'google_calendar_create_event' });

  const payloadResult = buildCalendarCreateEventPayload({
    transcript: params.transcript,
    languageCode: params.languageCode,
    referenceNow: params.referenceNow,
  });

  if (!payloadResult.ok) {
    return {
      result: {
        status: 'failed',
        tool: 'google_calendar_create_event',
        verified: false,
        errorCode: payloadResult.reason,
        errorMessage: payloadResult.detail,
      },
      reply: buildDateParseFailureReply(params.languageCode),
      scheduleIso: null,
      operationalUxPhase: 'failed',
    };
  }

  const access = await resolveCalendarWriteAccessState();

  if (!access.connected || !access.hasWriteAccess) {
    const pending = await enqueueCalendarCreateAction({
      payload: payloadResult.payload,
      transcript: params.transcript,
      languageCode: params.languageCode,
    });

    return {
      result: {
        status: 'pending',
        tool: 'google_calendar_create_event',
        verified: false,
        errorCode: 'calendar_auth_required',
      },
      reply: buildCalendarAuthRequiredReply(params.languageCode),
      scheduleIso: payloadResult.scheduleIso,
      requiresCalendarAuth: true,
      operationalUxPhase: 'auth_required',
      pendingActionId: pending.id,
    };
  }

  logActionExecution('execution_started', {
    status: 'executing',
    payload: payloadResult.payload.summary,
    operationalUxPhase: 'creating_event',
  });

  const apiResult = await createGoogleCalendarEvent(payloadResult.payload);

  if (!apiResult.ok) {
    if (apiResult.errorCode === 'calendar_not_connected' || apiResult.errorCode === 'calendar_write_forbidden') {
      const pending = await enqueueCalendarCreateAction({
        payload: payloadResult.payload,
        transcript: params.transcript,
        languageCode: params.languageCode,
      });

      return {
        result: {
          status: 'pending',
          tool: 'google_calendar_create_event',
          verified: false,
          errorCode: 'calendar_auth_required',
          errorMessage: apiResult.errorMessage,
        },
        reply: buildCalendarAuthRequiredReply(params.languageCode),
        scheduleIso: payloadResult.scheduleIso,
        requiresCalendarAuth: true,
        operationalUxPhase: 'auth_required',
        pendingActionId: pending.id,
      };
    }

    return {
      result: {
        status: 'failed',
        tool: 'google_calendar_create_event',
        verified: false,
        errorCode: apiResult.errorCode,
        errorMessage: apiResult.errorMessage,
      },
      reply: buildFailureReply(
        params.languageCode,
        apiResult.errorCode === 'calendar_api_unavailable'
          ? 'Google Calendar API unavailable.'
          : apiResult.errorMessage,
      ),
      scheduleIso: payloadResult.scheduleIso,
      operationalUxPhase: 'failed',
    };
  }

  const result: ActionExecutionResult = {
    status: 'success',
    tool: 'google_calendar_create_event',
    verified: true,
    event: apiResult.event,
  };

  const reply = buildSuccessReply(params.languageCode, apiResult.event);
  assertNoFakeOperationalSuccess(reply, result.status);

  return {
    result,
    reply,
    scheduleIso: payloadResult.scheduleIso,
    operationalUxPhase: 'event_created',
  };
}

export function buildSuccessReplyFromVerifiedEvent(
  languageCode: VoiceLanguageCode,
  event: NonNullable<ActionExecutionResult['event']>,
) {
  const reply = buildSuccessReply(languageCode, event);
  assertNoFakeOperationalSuccess(reply, 'success');
  return reply;
}
