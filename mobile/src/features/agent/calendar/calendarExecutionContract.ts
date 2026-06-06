import type { CalendarCommandKind } from '@/src/features/agent/calendar/calendarCommandTypes';
import {
  enforceCalendarMutationSuccessReplyPolicy,
  isCalendarMutationSuccessReply,
  isVerifiedCalendarCreateSuccess,
  isVerifiedCalendarDeleteSuccess,
  isVerifiedCalendarMutationForIntent,
  isVerifiedCalendarUpdateSuccess,
} from '@/src/features/agent/calendar/calendarMutationSuccessReplyGuard';
import { isOperationalCalendarWriteRequest } from '@/src/features/agent/intent/operationalCalendarWriteDetection';
import type { CalendarToolResponse } from '@/src/features/agent/execution/calendarToolContract';
import { containsFakeOperationalSuccessClaim } from '@/src/features/agent/execution/operationalExecutionHonesty';
import { isSoftCalendarRefusalReply } from '@/src/features/agent/execution/calendarSoftRefusalGuard';

export {
  isCalendarMutationSuccessReply,
  isVerifiedCalendarCreateSuccess,
  isVerifiedCalendarDeleteSuccess,
  isVerifiedCalendarUpdateSuccess,
} from '@/src/features/agent/calendar/calendarMutationSuccessReplyGuard';

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
    isCalendarMutationSuccessReply(normalized) ||
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
    isCalendarMutationSuccessReply(normalized) &&
    !isVerifiedCalendarMutationForIntent(tool, 'create_calendar_event') &&
    !isVerifiedCalendarMutationForIntent(tool, 'update_calendar_event') &&
    !isVerifiedCalendarMutationForIntent(tool, 'delete_calendar_event')
  ) {
    return true;
  }

  if (
    (normalized.startsWith('Готово.') || normalized.startsWith('Done.')) &&
    !isVerifiedCalendarMutationForIntent(tool, 'create_calendar_event') &&
    !isVerifiedCalendarMutationForIntent(tool, 'update_calendar_event') &&
    !isVerifiedCalendarMutationForIntent(tool, 'delete_calendar_event')
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
  const mutationSuccessGuarded = enforceCalendarMutationSuccessReplyPolicy({
    candidateReply: params.candidateReply,
    terminalReply: params.terminalReply,
    tool: params.tool,
    intent: params.intent,
  });

  if (!isOperationalCalendarWriteRequest(params.userTranscript)) {
    return mutationSuccessGuarded;
  }

  if (mutationSuccessGuarded !== params.candidateReply) {
    return mutationSuccessGuarded;
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

  if (isVerifiedCalendarMutationForIntent(params.tool, params.intent)) {
    return params.terminalReply;
  }

  if (params.tool?.status === 'SUCCESS') {
    return buildFailureTerminalReply(
      'CALENDAR_EXECUTION_CONTRACT',
      `${params.intent} success reply blocked — missing verified tool confirmation`,
    );
  }

  if (params.tool?.status === 'FAILURE' && isCalendarMutationSuccessReply(params.candidateReply)) {
    return params.terminalReply;
  }

  if (params.tool?.status === 'FAILURE' && !params.candidateReply.startsWith('FAILURE:')) {
    return params.terminalReply;
  }

  if (params.tool?.status === 'PENDING' && !params.candidateReply.startsWith('PENDING:')) {
    return params.terminalReply;
  }

  return params.candidateReply;
}
