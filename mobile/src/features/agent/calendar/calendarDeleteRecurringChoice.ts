import {
  isRecurringGoogleCalendarInstanceId,
  parseGoogleCalendarRecurringEventId,
} from '@/src/features/agent/calendar/calendarRecurringEventIds';
import type { CalendarEvent } from '@/src/entities/calendar/types';

export type RecurringDeleteScope = 'occurrence' | 'series';

export function isRecurringCalendarEventForDelete(event: Pick<CalendarEvent, 'id'>) {
  return isRecurringGoogleCalendarInstanceId(event.id);
}

export function buildCalendarDeleteRecurringChoiceReply(locale: 'ru' | 'en' | 'uk', title: string) {
  const normalizedTitle = title.trim() || 'событие';

  if (locale === 'uk') {
    return `Подія «${normalizedTitle}» повторюється. Видалити лише цю подію чи всю серію?`;
  }

  if (locale === 'ru') {
    return `Событие «${normalizedTitle}» повторяется. Удалить только это событие или всю серию?`;
  }

  return `"${normalizedTitle}" is recurring. Delete only this occurrence or the entire series?`;
}

export function parseRecurringDeleteScopeReply(reply: string): RecurringDeleteScope | null {
  const normalized = reply.trim().toLowerCase();

  if (
    /^(?:only\s+this(?:\s+one|\s+event|\s+occurrence)?|this\s+occurrence|this\s+event|just\s+this(?:\s+one)?)$/iu.test(
      normalized,
    ) ||
    /^(?:только\s+это(?:\s+событие)?|только\s+эту(?:\s+встречу)?|это\s+событие|эту\s+встречу|одно\s+событие)$/iu.test(
      normalized,
    ) ||
    /^(?:лише\s+цю(?:\s+подію)?|тільки\s+цю(?:\s+подію)?|цю\s+подію)$/iu.test(normalized)
  ) {
    return 'occurrence';
  }

  if (
    /^(?:entire\s+series|whole\s+series|all\s+occurrences|the\s+series|full\s+series)$/iu.test(
      normalized,
    ) ||
    /^(?:всю\s+серию|всю\s+серію|вся\s+серия|вся\s+серія|все\s+события|всі\s+події)$/iu.test(
      normalized,
    ) ||
    /^(?:усю\s+серію|всю\s+серію)$/iu.test(normalized)
  ) {
    return 'series';
  }

  if (/^(?:1|перв(?:ое|ый|а|ую)|перш(?:е|ий|а|у)|one|first)$/iu.test(normalized)) {
    return 'occurrence';
  }

  if (/^(?:2|втор(?:ое|ой|ая|ую)|друг(?:ое|ой|ая|ую)|two|second)$/iu.test(normalized)) {
    return 'series';
  }

  return null;
}

export function resolveDeleteEventIdForRecurringScope(params: {
  eventId: string;
  deleteScope: RecurringDeleteScope;
}) {
  const parsed = parseGoogleCalendarRecurringEventId(params.eventId);

  if (params.deleteScope === 'series') {
    return parsed.seriesMasterId;
  }

  return parsed.instanceId;
}
