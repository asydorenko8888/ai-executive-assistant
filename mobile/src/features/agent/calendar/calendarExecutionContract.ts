import type { CalendarCommandKind } from '@/src/features/agent/calendar/calendarCommandTypes';
import { isOperationalCalendarWriteRequest } from '@/src/features/agent/intent/operationalCalendarWriteDetection';
import type { CalendarToolResponse } from '@/src/features/agent/execution/calendarToolContract';
import { containsFakeOperationalSuccessClaim } from '@/src/features/agent/execution/operationalExecutionHonesty';
import { isSoftCalendarRefusalReply } from '@/src/features/agent/execution/calendarSoftRefusalGuard';

const FAKE_CALENDAR_CLAIM_PATTERNS = [
  /подготов/i,
  /prepare/i,
  /when\s+(?:it(?:'s| is)\s+)?possible/i,
  /позже/i,
  /later/i,
  /сейчас\s+не\s+могу/i,
  /cannot\s+right\s+now/i,
  /can't\s+right\s+now/i,
  /понял.*(?:добав|внес|создал|added|created)/i,
  /understood.*(?:added|created|scheduled)/i,
  /проверил.*календар/i,
  /checked.*calendar/i,
  /я\s+перен[ёе]с/i,
  /i\s+moved/i,
  /i(?:'ve| have)\s+moved/i,
  /i(?:'ve| have)\s+rescheduled/i,
  /rescheduled/i,
  /обновил/i,
  /обновлено/i,
  /updated\s+the\s+event/i,
  /i\s+added/i,
  /i(?:'ve| have)\s+added/i,
  /записал/i,
  /создал/i,
  /one minute/i,
  /минуточку/i,
  /сейчас\s+сделаю/i,
];

export function isTerminalCalendarToolReply(text: string) {
  const normalized = text.trim();

  return (
    normalized.startsWith('FAILURE:') ||
    normalized.startsWith('PENDING:') ||
    normalized.startsWith('Event created successfully:') ||
    normalized.startsWith('Событие создано успешно:') ||
    normalized.startsWith('Подію створено успішно:') ||
    normalized.startsWith('Event removed successfully:') ||
    normalized.startsWith('Событие удалено успешно:') ||
    normalized.startsWith('Подію видалено успішно:') ||
    normalized.startsWith('Event updated successfully:') ||
    normalized.startsWith('Событие обновлено успешно:') ||
    normalized.startsWith('Подію оновлено успішно:') ||
    normalized.startsWith('Событие перенесено:') ||
    normalized.startsWith('Подію перенесено:') ||
    normalized.includes(' moved successfully.\n') ||
    normalized.includes('Фактическое время:') ||
    normalized.includes('Фактичний час:') ||
    normalized.includes('Actual time:') ||
    normalized.startsWith('Готово.') ||
    normalized.startsWith('Done.') ||
    normalized.includes('Я додав:') ||
    normalized.includes('Я добавил:') ||
    normalized.includes('Я видалив:') ||
    normalized.includes('Я удалил:') ||
    normalized.includes('Я удалил событие:') ||
    normalized.includes('I deleted the event:') ||
    normalized.includes('Я не нашёл такое событие') ||
    normalized.includes('Я нашёл несколько похожих') ||
    normalized.includes('I could not find that event') ||
    normalized.includes('I found several similar events')
  );
}

export function isVerifiedCalendarCreateSuccess(tool: CalendarToolResponse | null | undefined) {
  return Boolean(
    tool &&
      tool.status === 'SUCCESS' &&
      tool.verified &&
      tool.verificationFetched &&
      tool.eventId &&
      tool.event?.id,
  );
}

export function isVerifiedCalendarDeleteSuccess(tool: CalendarToolResponse | null | undefined) {
  return Boolean(
    tool &&
      tool.status === 'SUCCESS' &&
      tool.verified &&
      tool.verificationFetched &&
      tool.eventId,
  );
}

export function isVerifiedCalendarUpdateSuccess(tool: CalendarToolResponse | null | undefined) {
  return Boolean(
    tool &&
      tool.status === 'SUCCESS' &&
      tool.verified &&
      tool.verificationFetched &&
      tool.eventId &&
      tool.event?.id,
  );
}

export function isFakeCalendarAssistantReply(text: string, tool: CalendarToolResponse | null | undefined) {
  const normalized = text.trim();

  if (!normalized) {
    return true;
  }

  if (isSoftCalendarRefusalReply(normalized)) {
    return true;
  }

  if (FAKE_CALENDAR_CLAIM_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return true;
  }

  if (containsFakeOperationalSuccessClaim(normalized)) {
    return true;
  }

  if (
    (normalized.startsWith('Готово.') ||
      normalized.startsWith('Done.') ||
      normalized.startsWith('Event created successfully:') ||
      normalized.startsWith('Событие создано успешно:') ||
      normalized.startsWith('Подію створено успішно:') ||
      normalized.startsWith('Event removed successfully:') ||
      normalized.startsWith('Событие удалено успешно:') ||
      normalized.startsWith('Подію видалено успішно:') ||
      normalized.startsWith('Event updated successfully:') ||
      normalized.startsWith('Событие обновлено успешно:') ||
      normalized.startsWith('Подію оновлено успішно:')) &&
    !isVerifiedCalendarCreateSuccess(tool) &&
    !isVerifiedCalendarDeleteSuccess(tool) &&
    !isVerifiedCalendarUpdateSuccess(tool)
  ) {
    return true;
  }

  return false;
}

export function buildFailureTerminalReply(errorCode: string, message: string) {
  return `FAILURE: ${errorCode}: ${message}`;
}

export function assertCalendarReplyMatchesTool(params: {
  userTranscript: string;
  candidateReply: string;
  terminalReply: string;
  tool: CalendarToolResponse | null | undefined;
  intent: CalendarCommandKind;
}) {
  if (!isOperationalCalendarWriteRequest(params.userTranscript)) {
    return params.candidateReply;
  }

  if (isFakeCalendarAssistantReply(params.candidateReply, params.tool)) {
    console.error('[Calendar Contract] blocked non-tool calendar reply', {
      intent: params.intent,
      preview: params.candidateReply.slice(0, 160),
      toolStatus: params.tool?.status ?? null,
      eventId: params.tool?.eventId ?? null,
    });

    return params.terminalReply;
  }

  if (params.tool?.status === 'SUCCESS') {
    if (params.intent === 'create_calendar_event' && !isVerifiedCalendarCreateSuccess(params.tool)) {
      return buildFailureTerminalReply(
        'CALENDAR_EXECUTION_CONTRACT',
        'create success reply blocked — missing verified eventId',
      );
    }

    if (params.intent === 'update_calendar_event' && !isVerifiedCalendarUpdateSuccess(params.tool)) {
      return buildFailureTerminalReply(
        'CALENDAR_EXECUTION_CONTRACT',
        'update success reply blocked — missing verified eventId',
      );
    }

    if (params.intent === 'delete_calendar_event' && !isVerifiedCalendarDeleteSuccess(params.tool)) {
      return buildFailureTerminalReply(
        'CALENDAR_EXECUTION_CONTRACT',
        'delete success reply blocked — missing verified delete confirmation',
      );
    }

    if (!isTerminalCalendarToolReply(params.candidateReply)) {
      return params.terminalReply;
    }
  }

  if (params.tool?.status === 'FAILURE' && !params.candidateReply.startsWith('FAILURE:')) {
    return params.terminalReply;
  }

  if (params.tool?.status === 'PENDING' && !params.candidateReply.startsWith('PENDING:')) {
    return params.terminalReply;
  }

  return params.candidateReply;
}
