export {
  buildHumanizedCalendarGuidanceLine,
  isCalendarAwareQuestion,
  isCalendarScheduleQuestion,
  tryBuildHumanizedCalendarReply,
  tryBuildSpokenCalendarReply,
  type CalendarResponseTone,
  type HumanizedCalendarReplyResult,
  type SpokenCalendarReplyResult,
  type SpokenDayLoad,
  type SpokenUrgency,
} from '@/src/features/voice/speech/calendarSpokenReply';

export {
  analyzeCalendarSituation,
  buildSituationContextForLlm,
  type CalendarSituationAnalysis,
  type SituationalReasonCategory,
} from '@/src/features/agent/calendar/calendarSituationalReasoning';

export {
  formatVoiceResponse,
  prepareTextForSpeech,
  sanitizeRoboticSpeech,
} from '@/src/features/voice/speech/voiceSpeechFormatter';
