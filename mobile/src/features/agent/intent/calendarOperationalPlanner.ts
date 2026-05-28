import {
  logExecutionEvent,
  logPlannerFailure,
  type AssistantExecutionState,
} from '@/src/features/agent/conversation/assistantExecutionObservability';
import {
  classifyAssistantIntent,
  logAssistantIntentRouting,
} from '@/src/features/agent/intent/assistantIntentRouter';
import { isOperationalCalendarWriteRequest } from '@/src/features/agent/intent/operationalCalendarWriteDetection';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { getChatLocaleFromVoiceLanguage } from '@/src/features/chat/services/voiceLanguage';
import { parseSpokenClockTime } from '@/src/features/reminders/reminderTimeParser';

export type CalendarPlannerFailureReason =
  | 'not_calendar_write_intent'
  | 'date_parse_failed'
  | 'calendar_not_connected'
  | 'calendar_write_not_available'
  | 'planner_exception';

export type CalendarOperationalPlannerResult = {
  state: AssistantExecutionState;
  reply: string;
  failureReason?: CalendarPlannerFailureReason;
  scheduleLabel?: string | null;
  scheduleIso?: string | null;
};

export type CalendarOperationalPlannerParams = {
  transcript: string;
  languageCode: VoiceLanguageCode;
  calendarConnected: boolean;
  referenceNow: Date;
};

function extractClockFragment(transcript: string) {
  const patterns = [
    /\b(?:at|@|о|в|на)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?)/i,
    /\b(\d{1,2}:\d{2})\b/,
    /\b(\d{1,2})\s*(am|pm)\b/i,
  ];

  for (const pattern of patterns) {
    const match = transcript.match(pattern);

    if (match) {
      return match[1] ?? match[0];
    }
  }

  return null;
}

function resolveDayOffset(transcript: string) {
  const normalized = transcript.toLowerCase();

  if (/\b(?:tomorrow|завтра)\b/i.test(normalized)) {
    return 1;
  }

  if (/\b(?:today|сьогодні|сегодня)\b/i.test(normalized)) {
    return 0;
  }

  return null;
}

function parseOperationalScheduleHint(transcript: string, referenceNow: Date) {
  const dayOffset = resolveDayOffset(transcript);
  const clockFragment = extractClockFragment(transcript);

  logExecutionEvent('date_parsing', 'Parsing schedule hint', {
    dayOffset,
    clockFragment,
    referenceNow: referenceNow.toISOString(),
  });

  if (dayOffset === null && !clockFragment) {
    return {
      ok: false as const,
      reason: 'date_parse_failed' as const,
      detail: 'No day or time fragment found',
    };
  }

  const base = new Date(referenceNow);

  if (dayOffset !== null) {
    base.setDate(base.getDate() + dayOffset);
  }

  if (!clockFragment) {
    return {
      ok: true as const,
      date: base,
      hasExplicitTime: false,
    };
  }

  try {
    const parsedTime = parseSpokenClockTime(clockFragment, base);

    if (!parsedTime) {
      return {
        ok: false as const,
        reason: 'date_parse_failed' as const,
        detail: `Could not parse clock fragment: ${clockFragment}`,
      };
    }

    if (dayOffset !== null) {
      parsedTime.setFullYear(base.getFullYear(), base.getMonth(), base.getDate());
    }

    return {
      ok: true as const,
      date: parsedTime,
      hasExplicitTime: true,
    };
  } catch (error) {
    return {
      ok: false as const,
      reason: 'date_parse_failed' as const,
      detail: error instanceof Error ? error.message : 'parseSpokenClockTime threw',
      error,
    };
  }
}

function formatScheduleLabel(
  schedule: Extract<ReturnType<typeof parseOperationalScheduleHint>, { ok: true }>,
  locale: ReturnType<typeof getChatLocaleFromVoiceLanguage>,
) {
  if (!schedule.hasExplicitTime) {
    if (locale === 'uk' || locale === 'ru') {
      return 'завтра';
    }

    return 'tomorrow';
  }

  return schedule.date.toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function buildPlannerFailureReply(
  locale: ReturnType<typeof getChatLocaleFromVoiceLanguage>,
  reason: CalendarPlannerFailureReason,
) {
  if (locale === 'uk') {
    if (reason === 'date_parse_failed') {
      return 'Зрозумів запит у календар, але не зміг розібрати час. Напиши, будь ласка, «завтра о 9:00» або точну дату.';
    }

    if (reason === 'calendar_not_connected') {
      return 'Зрозумів — треба спочатку підключити Google Calendar, тоді зможу поставити подію.';
    }

    return 'Зрозумів календарний запит, але зараз не можу завершити запис. Спробуй ще раз або уточни час і назву зустрічі.';
  }

  if (locale === 'ru') {
    if (reason === 'date_parse_failed') {
      return 'Понял календарный запрос, но не смог разобрать время. Напиши, пожалуйста, «завтра в 9:00» или точную дату.';
    }

    if (reason === 'calendar_not_connected') {
      return 'Понял — сначала нужно подключить Google Calendar, тогда смогу поставить событие.';
    }

    return 'Понял календарный запрос, но сейчас не могу завершить запись. Попробуй ещё раз или уточни время и название встречи.';
  }

  if (reason === 'date_parse_failed') {
    return 'I understood the calendar request but could not parse the date. Try tomorrow at 9:00 AM or an exact date.';
  }

  if (reason === 'calendar_not_connected') {
    return 'I understood the calendar request — Google Calendar needs to be connected before I can place the event.';
  }

  return 'I understood the calendar request but could not complete the write right now. Tell me the exact time and title.';
}

function buildCalendarWriteSuccessReply(
  params: CalendarOperationalPlannerParams,
  scheduleLabel: string | null,
) {
  const locale = getChatLocaleFromVoiceLanguage(params.languageCode);
  const mentionsMove = /\b(?:moved|rescheduled|shifted|переніс|перенес|перенёс)\b/i.test(params.transcript);

  if (locale === 'uk') {
    const ack = scheduleLabel
      ? mentionsMove
        ? `Зрозумів — перенесення зафіксував, ${scheduleLabel}.`
        : `Зрозумів — ${scheduleLabel}.`
      : mentionsMove
        ? 'Зрозумів — перенесення зафіксував.'
        : 'Зрозумів — додамо в календар.';

    const ops = params.calendarConnected
      ? 'Запис у Google Calendar з чату поки через підтвердження в застосунку — надішли назву зустрічі, якщо хочеш, зберу чернетку події.'
      : 'Google Calendar ще не підключений — як тільки підключимо, поставлю це на завтра.';

    return `${ack} ${ops}`;
  }

  if (locale === 'ru') {
    const ack = scheduleLabel
      ? mentionsMove
        ? `Понял — перенос зафиксировал, ${scheduleLabel}.`
        : `Понял — ${scheduleLabel}.`
      : mentionsMove
        ? 'Понял — перенос зафиксировал.'
        : 'Понял — добавим в календарь.';

    const ops = params.calendarConnected
      ? 'Запись в Google Calendar из чата пока через подтверждение в приложении — скинь название встречи, соберу черновик события.'
      : 'Google Calendar ещё не подключён — как только подключим, поставлю на завтра.';

    return `${ack} ${ops}`;
  }

  const ack = scheduleLabel
    ? mentionsMove
      ? `Got it — I noted the move for ${scheduleLabel}.`
      : `Got it — ${scheduleLabel}.`
    : mentionsMove
      ? 'Got it — I noted the move.'
      : 'Got it — we can put that on the calendar.';

  const ops = params.calendarConnected
    ? 'Calendar is connected for reading; placing events from here still goes through a quick confirm in the app — send the meeting title if you want me to draft the event.'
    : 'Google Calendar is not connected yet — once it is, I can place this for tomorrow.';

  return `${ack} ${ops}`;
}

function executeCalendarWriteTool(params: CalendarOperationalPlannerParams, scheduleLabel: string | null) {
  logExecutionEvent('calendar_tool', 'Calendar write tool invoked', {
    calendarConnected: params.calendarConnected,
    scheduleLabel,
  });

  if (!params.calendarConnected) {
    const failureReason: CalendarPlannerFailureReason = 'calendar_not_connected';
    logPlannerFailure(failureReason);

    return {
      state: 'tool_failure' as const,
      failureReason,
      reply: buildPlannerFailureReply(getChatLocaleFromVoiceLanguage(params.languageCode), failureReason),
    };
  }

  logExecutionEvent('calendar_tool', 'Calendar write channel not automated — returning draft path', {
    outcome: 'calendar_write_not_available',
  });

  return {
    state: 'tool_success' as const,
    reply: buildCalendarWriteSuccessReply(params, scheduleLabel),
  };
}

export function executeCalendarOperationalPlanner(
  params: CalendarOperationalPlannerParams,
): CalendarOperationalPlannerResult | null {
  if (!isOperationalCalendarWriteRequest(params.transcript)) {
    return null;
  }

  const intent = classifyAssistantIntent(params.transcript);
  logExecutionEvent('intent_detection', 'Calendar operational planner input', {
    transcriptPreview: params.transcript.slice(0, 120),
    intent: intent.primary,
    hardOperational: intent.hasHardOperationalIntent,
  });
  logAssistantIntentRouting(params.transcript, intent);

  logExecutionEvent('planner_activation', 'Calendar operational planner started');

  let state: AssistantExecutionState = 'planning';

  try {
    const parseResult = parseOperationalScheduleHint(params.transcript, params.referenceNow);

    if (!parseResult.ok) {
      logPlannerFailure(parseResult.reason, parseResult.error);
      state = 'tool_failure';

      return {
        state,
        failureReason: parseResult.reason,
        reply: buildPlannerFailureReply(
          getChatLocaleFromVoiceLanguage(params.languageCode),
          parseResult.reason,
        ),
        scheduleLabel: null,
        scheduleIso: null,
      };
    }

    const scheduleLabel = formatScheduleLabel(parseResult, getChatLocaleFromVoiceLanguage(params.languageCode));
    const scheduleIso = parseResult.date.toISOString();

    logExecutionEvent('date_parsing', 'Schedule parsed', {
      scheduleLabel,
      scheduleIso,
      hasExplicitTime: parseResult.hasExplicitTime,
    });

    state = 'tool_call';
    const toolResult = executeCalendarWriteTool(params, scheduleLabel);

    return {
      state: toolResult.state,
      failureReason: toolResult.failureReason,
      reply: toolResult.reply,
      scheduleLabel,
      scheduleIso,
    };
  } catch (error) {
    logPlannerFailure('planner_exception', error);
    state = 'tool_failure';

    return {
      state,
      failureReason: 'planner_exception',
      reply: buildPlannerFailureReply(
        getChatLocaleFromVoiceLanguage(params.languageCode),
        'planner_exception',
      ),
      scheduleLabel: null,
      scheduleIso: null,
    };
  } finally {
    logExecutionEvent('planner_activation', 'Calendar operational planner finished', { finalState: state });
  }
}
