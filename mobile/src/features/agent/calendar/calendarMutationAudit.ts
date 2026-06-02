import { formatCalendarScheduleLabelForUi } from '@/src/features/agent/calendar/calendarScheduleDisplay';
import { getExecutiveCalendarTimezone } from '@/src/features/agent/calendar/calendarTimezone';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { getChatLocaleFromVoiceLanguage } from '@/src/features/chat/services/voiceLanguage';

export type CalendarMutationAuditStatus =
  | 'success'
  | 'failed'
  | 'cancelled'
  | 'conflict_pending'
  | 'no_op_blocked';

export type CalendarMutationAuditRecord = {
  operationType: 'CREATE' | 'UPDATE' | 'DELETE' | 'MOVE';
  requestedEvent: string | null;
  resolvedEvent: string | null;
  eventId: string | null;
  oldTime: string | null;
  newTime: string | null;
  conflictDetected: boolean;
  conflictOverride: boolean;
  status: CalendarMutationAuditStatus;
  detail?: string | null;
};

function formatAuditTime(iso: string | null, languageCode: VoiceLanguageCode, referenceNow: Date) {
  if (!iso) {
    return null;
  }

  const ms = Date.parse(iso);

  if (Number.isNaN(ms)) {
    return iso;
  }

  const locale = getChatLocaleFromVoiceLanguage(languageCode);
  const timeZone = getExecutiveCalendarTimezone();

  return formatCalendarScheduleLabelForUi({
    instantMs: ms,
    referenceMs: referenceNow.getTime(),
    locale,
    timeZone,
  });
}

export function logCalendarMutationAudit(
  record: CalendarMutationAuditRecord,
  options?: { languageCode?: VoiceLanguageCode; referenceNow?: Date },
) {
  const referenceNow = options?.referenceNow ?? new Date();
  const languageCode = options?.languageCode ?? 'en-US';
  const oldTime =
    record.oldTime && !record.oldTime.includes('T')
      ? record.oldTime
      : formatAuditTime(record.oldTime, languageCode, referenceNow);
  const newTime =
    record.newTime && !record.newTime.includes('T')
      ? record.newTime
      : formatAuditTime(record.newTime, languageCode, referenceNow);

  console.log('[CALENDAR MUTATION AUDIT]');
  console.log(
    JSON.stringify({
      operationType: record.operationType,
      requestedEvent: record.requestedEvent,
      resolvedEvent: record.resolvedEvent,
      eventId: record.eventId,
      oldTime,
      newTime,
      conflictDetected: record.conflictDetected,
      conflictOverride: record.conflictOverride,
      status: record.status,
      detail: record.detail ?? null,
    }),
  );
}
