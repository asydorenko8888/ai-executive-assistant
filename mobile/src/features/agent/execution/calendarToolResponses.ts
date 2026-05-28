import type { CalendarToolResponse } from '@/src/features/agent/execution/calendarToolContract';
import { buildOperationalTruthFact } from '@/src/features/agent/execution/operationalTruthFacts';
import { buildOperationalTruthReply } from '@/src/features/agent/execution/operationalTruthReplies';
import { buildOperationalVoiceReply } from '@/src/features/agent/execution/operationalVoiceLayer';
import type { CalendarExecutionState } from '@/src/features/agent/execution/calendarExecutionStates';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { getChatLocaleFromVoiceLanguage } from '@/src/features/chat/services/voiceLanguage';

export type CalendarToolReplyBundle = {
  tool: CalendarToolResponse;
  reply: string;
  spokenReply: string;
  executionState: CalendarExecutionState;
  requiresCalendarAuth: boolean;
};

function mapToolStatusToExecutionState(tool: CalendarToolResponse): CalendarExecutionState {
  if (tool.status === 'SUCCESS') {
    return 'success';
  }

  if (tool.status === 'PENDING') {
    return tool.errorCode === 'CALENDAR_AUTH_REQUIRED' ? 'authenticating' : 'verifying_event';
  }

  return 'failed';
}

function buildWritePermissionReply(languageCode: VoiceLanguageCode) {
  const locale = getChatLocaleFromVoiceLanguage(languageCode);

  if (locale === 'uk') {
    return {
      reply: 'Бачу календар, але немає дозволу на запис.',
      spoken: 'Бачу календар, але немає дозволу на запис.',
    };
  }

  if (locale === 'ru') {
    return {
      reply: 'Календар подключён, но нет разрешения на запись.',
      spoken: 'Календарь вижу, но нет разрешения на записать событие.',
    };
  }

  return {
    reply: 'I have calendar access awareness, but not write permission.',
    spoken: 'I have calendar access awareness, but not write permission.',
  };
}

function buildPendingReply(languageCode: VoiceLanguageCode, tool: CalendarToolResponse) {
  const locale = getChatLocaleFromVoiceLanguage(languageCode);

  if (tool.errorCode === 'CALENDAR_AUTH_REQUIRED') {
    if (locale === 'uk') {
      return {
        reply: 'Потрібен доступ до Google Calendar. Відкриваю авторизацію Google…',
        spoken: 'Потрібен доступ до Google Calendar. Відкриваю авторизацію Google.',
      };
    }

    if (locale === 'ru') {
      return {
        reply: 'Нужен доступ к Google Calendar. Открываю авторизацию Google…',
        spoken: 'Нужен доступ к Google Calendar. Открываю авторизацию Google.',
      };
    }

    return {
      reply: 'Calendar access required. Opening Google authorization…',
      spoken: 'Calendar access required. Opening Google authorization.',
    };
  }

  if (locale === 'uk') {
    return {
      reply: 'Ще чекаю підтвердження від Google Calendar. Не перезапускаю створення.',
      spoken: 'Ще чекаю підтвердження від Google Calendar.',
    };
  }

  if (locale === 'ru') {
    return {
      reply: 'Всё ещё жду подтверждения от Google Calendar. Не перезапускаю создание.',
      spoken: 'Всё ещё жду подтверждения от Google Calendar.',
    };
  }

  return {
    reply: 'Still waiting for confirmation from Google Calendar.',
    spoken: 'Still waiting for confirmation from Google Calendar.',
  };
}

function buildBlockedRetryReply(languageCode: VoiceLanguageCode) {
  const locale = getChatLocaleFromVoiceLanguage(languageCode);

  if (locale === 'uk') {
    return {
      reply: 'Цей календарний запит уже виконувався. Нову спробу не запускаю — спочатку перевір попередній результат.',
      spoken: 'Цей запит уже виконувався — нову спробу не запускаю.',
    };
  }

  if (locale === 'ru') {
    return {
      reply: 'Этот календарный запрос уже выполнялся. Новую попытку не запускаю — сначала проверь предыдущий результат.',
      spoken: 'Этот запрос уже выполнялся — новую попытку не запускаю.',
    };
  }

  return {
    reply: 'This calendar request was already attempted. I am not starting another create.',
    spoken: 'This calendar request was already attempted. I am not starting another create.',
  };
}

export function buildCalendarToolReplyBundle(
  tool: CalendarToolResponse,
  languageCode: VoiceLanguageCode,
): CalendarToolReplyBundle {
  if (tool.errorCode === 'GOOGLE_WRITE_PERMISSION_MISSING') {
    const copy = buildWritePermissionReply(languageCode);

    return {
      tool,
      reply: copy.reply,
      spokenReply: copy.spoken,
      executionState: 'failed',
      requiresCalendarAuth: true,
    };
  }

  if (tool.status === 'PENDING') {
    const copy = buildPendingReply(languageCode, tool);

    return {
      tool,
      reply: copy.reply,
      spokenReply: copy.spoken,
      executionState: mapToolStatusToExecutionState(tool),
      requiresCalendarAuth: tool.errorCode === 'CALENDAR_AUTH_REQUIRED',
    };
  }

  if (tool.errorCode === 'CALENDAR_MAX_RETRIES_EXCEEDED' || tool.errorCode === 'CALENDAR_OPERATION_IN_PROGRESS') {
    const copy = buildBlockedRetryReply(languageCode);

    return {
      tool,
      reply: copy.reply,
      spokenReply: copy.spoken,
      executionState: 'failed',
      requiresCalendarAuth: false,
    };
  }

  const executionState = mapToolStatusToExecutionState(tool);
  const fact = buildOperationalTruthFact({
    executionState,
    verified: tool.verified,
    event: tool.event,
    languageCode,
    errorCode: tool.errorCode,
  });

  return {
    tool,
    reply: buildOperationalTruthReply(fact, languageCode),
    spokenReply: buildOperationalVoiceReply(fact, languageCode),
    executionState,
    requiresCalendarAuth: tool.errorCode === 'CALENDAR_AUTH_REQUIRED',
  };
}

export function buildCalendarToolReplyFromLastResult(
  languageCode: VoiceLanguageCode,
  last: CalendarToolResponse,
) {
  return buildCalendarToolReplyBundle(last, languageCode);
}
