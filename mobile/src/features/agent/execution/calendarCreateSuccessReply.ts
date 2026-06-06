import type { VerifiedCalendarEvent } from '@/src/features/agent/execution/actionExecutionTypes';
import { buildStructuredCalendarCreateSuccessReply } from '@/src/features/agent/calendar/calendarMutationSuccessReply';
import { logCalendarCreate } from '@/src/features/agent/execution/calendarCreateLogger';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguageLocale';

export function buildNaturalCalendarCreateSuccessReply(params: {
  event: VerifiedCalendarEvent;
  languageCode: VoiceLanguageCode;
  referenceNow?: Date;
}) {
  const copy = buildStructuredCalendarCreateSuccessReply(params);

  logCalendarCreate('success reply', {
    eventId: params.event.id,
    summary: params.event.summary.trim(),
    startsAt: params.event.startsAt,
    reply: copy.reply,
  });

  return copy;
}
