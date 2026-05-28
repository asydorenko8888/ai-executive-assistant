import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { getChatLocaleFromVoiceLanguage } from '@/src/features/chat/services/voiceLanguage';
import { createGoogleCalendarEvent } from '@/src/features/agent/calendar/googleCalendarWriteService';
import {
  buildCalendarCreateEventPayload,
  formatVerifiedEventScheduleLabel,
} from '@/src/features/agent/execution/calendarEventPayloadBuilder';
import type { ActionExecutionResult } from '@/src/features/agent/execution/actionExecutionTypes';
import { logActionExecution } from '@/src/features/agent/execution/actionExecutionLogger';
import { assertNoFakeOperationalSuccess } from '@/src/features/agent/execution/operationalExecutionHonesty';

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

function buildNotConnectedReply(languageCode: VoiceLanguageCode) {
  const locale = getChatLocaleFromVoiceLanguage(languageCode);

  if (locale === 'uk') {
    return 'Не вдалося створити подію:\nGoogle Calendar не підключений.\nМожу зібрати чернетку події, але автоматично створити її зараз не можу.';
  }

  if (locale === 'ru') {
    return 'Не удалось создать встречу:\nGoogle Calendar не подключён.\nМогу подготовить черновик события, но автоматически создать его сейчас не могу.';
  }

  return 'Could not create the meeting:\nGoogle Calendar is not connected.\nI can prepare an event draft but cannot create it automatically right now.';
}

function buildSuccessReply(
  languageCode: VoiceLanguageCode,
  event: NonNullable<ActionExecutionResult['event']>,
) {
  const locale = getChatLocaleFromVoiceLanguage(languageCode);
  const { dayLine, timeLine, locationLine } = formatVerifiedEventScheduleLabel(event, languageCode);
  const lines = [dayLine, timeLine];

  if (locationLine) {
    lines.push(locationLine);
  }

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

function buildDraftOnlyReply(languageCode: VoiceLanguageCode, payloadPreview: string) {
  const locale = getChatLocaleFromVoiceLanguage(languageCode);

  if (locale === 'uk') {
    return `Можу підготувати чернетку події (${payloadPreview}), але автоматично створити її зараз не можу — потрібен доступ на запис у Google Calendar.`;
  }

  if (locale === 'ru') {
    return `Могу подготовить черновик события (${payloadPreview}), но автоматически создать его сейчас не могу — нужен доступ на запись в Google Calendar.`;
  }

  return `I can prepare the event draft (${payloadPreview}) but cannot create it automatically — Google Calendar write access is required.`;
}

export async function executeCalendarCreateEvent(
  params: CalendarCreateExecutionParams,
): Promise<CalendarCreateExecutionOutcome> {
  logActionExecution('intent_detected', {
    tool: 'google_calendar_create_event',
    transcriptPreview: params.transcript.slice(0, 120),
    calendarConnected: params.calendarConnected,
  });

  logActionExecution('tool_selected', { tool: 'google_calendar_create_event' });

  const payloadResult = buildCalendarCreateEventPayload({
    transcript: params.transcript,
    languageCode: params.languageCode,
    referenceNow: params.referenceNow,
  });

  if (!payloadResult.ok) {
    const result: ActionExecutionResult = {
      status: 'failed',
      tool: 'google_calendar_create_event',
      verified: false,
      errorCode: payloadResult.reason,
      errorMessage: payloadResult.detail,
    };

    return {
      result,
      reply: buildDateParseFailureReply(params.languageCode),
      scheduleIso: null,
    };
  }

  if (!params.calendarConnected) {
    const result: ActionExecutionResult = {
      status: 'failed',
      tool: 'google_calendar_create_event',
      verified: false,
      errorCode: 'calendar_not_connected',
    };

    return {
      result,
      reply: buildNotConnectedReply(params.languageCode),
      scheduleIso: payloadResult.scheduleIso,
    };
  }

  const executing: ActionExecutionResult = {
    status: 'executing',
    tool: 'google_calendar_create_event',
    verified: false,
  };

  logActionExecution('execution_started', { status: executing.status, payload: payloadResult.payload.summary });

  const apiResult = await createGoogleCalendarEvent(payloadResult.payload);

  if (!apiResult.ok) {
    if (apiResult.errorCode === 'calendar_write_forbidden') {
      const draftReply = buildDraftOnlyReply(
        params.languageCode,
        `${payloadResult.payload.summary}, ${payloadResult.payload.start.dateTime}`,
      );

      return {
        result: {
          status: 'failed',
          tool: 'google_calendar_create_event',
          verified: false,
          errorCode: apiResult.errorCode,
          errorMessage: apiResult.errorMessage,
        },
        reply: draftReply,
        scheduleIso: payloadResult.scheduleIso,
      };
    }

    const failureMessage =
      apiResult.errorCode === 'calendar_api_unavailable'
        ? 'Google Calendar API unavailable.'
        : apiResult.errorMessage;

    const reply = buildFailureReply(params.languageCode, failureMessage);

    return {
      result: {
        status: 'failed',
        tool: 'google_calendar_create_event',
        verified: false,
        errorCode: apiResult.errorCode,
        errorMessage: apiResult.errorMessage,
      },
      reply,
      scheduleIso: payloadResult.scheduleIso,
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
  };
}
