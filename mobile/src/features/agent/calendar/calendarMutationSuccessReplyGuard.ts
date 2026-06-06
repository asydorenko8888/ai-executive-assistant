import type { CalendarCommandKind } from '@/src/features/agent/calendar/calendarCommandTypes';
import type { CalendarToolResponse } from '@/src/features/agent/execution/calendarToolContract';

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

/** Tool-generated mutation success copy — LLM must never author these. */
export function isCalendarMutationSuccessReply(text: string): boolean {
  const normalized = text.trim();

  return (
    normalized.startsWith('Created event:') ||
    normalized.startsWith('Событие создано:') ||
    normalized.startsWith('Подію створено:') ||
    normalized.startsWith('Event updated:') ||
    normalized.startsWith('Событие перенесено:') ||
    normalized.startsWith('Подію перенесено:') ||
    normalized.startsWith('Event deleted:') ||
    normalized.startsWith('Событие удалено:') ||
    normalized.startsWith('Подію видалено:') ||
    normalized.startsWith('Event created successfully:') ||
    normalized.startsWith('Событие создано успешно:') ||
    normalized.startsWith('Подію створено успішно:') ||
    normalized.startsWith('Event removed successfully:') ||
    normalized.startsWith('Событие удалено успешно:') ||
    normalized.startsWith('Подію видалено успішно:') ||
    normalized.startsWith('Event updated successfully:') ||
    normalized.startsWith('Событие обновлено успешно:') ||
    normalized.startsWith('Подію оновлено успішно:')
  );
}

export function isVerifiedCalendarMutationForIntent(
  tool: CalendarToolResponse | null | undefined,
  intent: CalendarCommandKind,
): boolean {
  if (intent === 'create_calendar_event') {
    return isVerifiedCalendarCreateSuccess(tool);
  }

  if (intent === 'update_calendar_event') {
    return isVerifiedCalendarUpdateSuccess(tool);
  }

  if (intent === 'delete_calendar_event') {
    return isVerifiedCalendarDeleteSuccess(tool);
  }

  return false;
}

/**
 * Mutation success text is tool-owned. LLM may explain failures/clarifications,
 * but must never invent or paraphrase create/update/delete success outcomes.
 */
export function enforceCalendarMutationSuccessReplyPolicy(params: {
  candidateReply: string;
  terminalReply: string;
  tool: CalendarToolResponse | null | undefined;
  intent: CalendarCommandKind;
}): string {
  if (!isCalendarMutationSuccessReply(params.candidateReply)) {
    return params.candidateReply;
  }

  if (!isVerifiedCalendarMutationForIntent(params.tool, params.intent)) {
    console.error('[Calendar Contract] blocked LLM mutation success reply', {
      intent: params.intent,
      preview: params.candidateReply.slice(0, 160),
      toolStatus: params.tool?.status ?? null,
      verified: params.tool?.verified ?? null,
    });

    return params.terminalReply;
  }

  if (params.candidateReply.trim() !== params.terminalReply.trim()) {
    console.error('[Calendar Contract] replaced paraphrased mutation success with tool terminal', {
      intent: params.intent,
      candidatePreview: params.candidateReply.slice(0, 120),
      terminalPreview: params.terminalReply.slice(0, 120),
    });

    return params.terminalReply;
  }

  return params.candidateReply;
}
