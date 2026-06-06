import type { VerifiedCalendarEvent } from '@/src/features/agent/execution/actionExecutionTypes';
import { buildStructuredCalendarDeleteSuccessReply } from '@/src/features/agent/calendar/calendarMutationSuccessReply';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguageLocale';

export function buildNaturalCalendarDeleteSuccessReply(params: {
  event: VerifiedCalendarEvent;
  languageCode: VoiceLanguageCode;
  referenceNow?: Date;
}) {
  return buildStructuredCalendarDeleteSuccessReply(params);
}
