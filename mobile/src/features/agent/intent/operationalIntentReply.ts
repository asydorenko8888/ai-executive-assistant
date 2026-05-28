import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { detectHardOperationalIntent } from '@/src/features/agent/intent/assistantIntentRouter';
import { logCalendarDecision } from '@/src/features/agent/calendar/calendarDecisionLogger';

export type OperationalIntentReplyParams = {
  transcript: string;
  languageCode: VoiceLanguageCode;
  calendarConnected: boolean;
  referenceNow: Date;
};

/** Non-calendar operational intents only — calendar uses executeCalendarCommand. */
export async function tryBuildOperationalIntentReply(
  params: OperationalIntentReplyParams,
) {
  if (!detectHardOperationalIntent(params.transcript)) {
    return null;
  }

  logCalendarDecision('reasonForRefusal', {
    reason: 'non_calendar_operational_not_supported',
    transcriptPreview: params.transcript.slice(0, 120),
  });

  return null;
}
