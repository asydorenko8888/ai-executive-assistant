import type { VerifiedCalendarEvent } from '@/src/features/agent/execution/actionExecutionTypes';
import { buildStructuredCalendarUpdateSuccessReply } from '@/src/features/agent/calendar/calendarMutationSuccessReply';
import { logCalendarCreate } from '@/src/features/agent/execution/calendarCreateLogger';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguageLocale';

export function buildNaturalCalendarUpdateSuccessReply(params: {
  event: VerifiedCalendarEvent;
  languageCode: VoiceLanguageCode;
  referenceNow?: Date;
  previousStartsAt?: string;
  timeZone?: string;
}) {
  const copy = buildStructuredCalendarUpdateSuccessReply(params);

  logCalendarCreate('update success reply', {
    eventId: params.event.id,
    summary: params.event.summary.trim(),
    startsAt: params.event.startsAt,
    endsAt: params.event.endsAt,
    previousStartsAt: params.previousStartsAt ?? null,
    reply: copy.reply,
  });

  return copy;
}
