import { classifyAssistantIntent } from '@/src/features/agent/intent/assistantIntentRouter';
import { isTemporalFactualQuery } from '@/src/features/agent/factual/factualTimeGrounding';
import type { AssistantIntentAnalysis } from '@/src/features/agent/intent/assistantIntentRouter';
import {
  createEmptyIntentAnalysis,
  isLowConfidenceUnrecognizedTranscript,
  logIntentClassificationFailed,
} from '@/src/features/agent/conversation/voiceTurnFallback';

export {
  buildFallbackAssistantTurnResolution,
  buildUnrecognizedCommandFallbackReply,
  logFallbackReplyBuilt,
  logIntentClassificationFailed,
  logRouteHandlerFailed,
  logTranscriptReceived,
  logVoiceTurnStart,
  safeRouteHandler,
  UNRECOGNIZED_COMMAND_FALLBACK,
} from '@/src/features/agent/conversation/voiceTurnFallback';

export function safeClassifyAssistantIntent(transcript: string): AssistantIntentAnalysis {
  try {
    return classifyAssistantIntent(transcript);
  } catch (error) {
    logIntentClassificationFailed({ transcript, error });
    return createEmptyIntentAnalysis();
  }
}

export function transcriptMatchesKnownLocalDomain(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized) {
    return false;
  }

  try {
    const { isWeatherIntent } = require('@/src/features/weather/weatherClassification') as typeof import('@/src/features/weather/weatherClassification');
    const { isLocalAlarmIntent } = require('@/src/features/local-alarms/localAlarmClassification') as typeof import('@/src/features/local-alarms/localAlarmClassification');
    const { isLocalReminderIntent } = require('@/src/features/local-reminders/localReminderClassification') as typeof import('@/src/features/local-reminders/localReminderClassification');
    const { isDeterministicCalendarReadQuery } = require('@/src/features/agent/calendarIntelligence') as typeof import('@/src/features/agent/calendarIntelligence');

    return (
      isWeatherIntent(normalized) ||
      isLocalAlarmIntent(normalized) ||
      isLocalReminderIntent(normalized) ||
      isTemporalFactualQuery(normalized) ||
      isDeterministicCalendarReadQuery(normalized)
    );
  } catch {
    return false;
  }
}

export function isUnrecognizedVoiceCommand(transcript: string, intent: AssistantIntentAnalysis) {
  if (transcriptMatchesKnownLocalDomain(transcript)) {
    return false;
  }

  return isLowConfidenceUnrecognizedTranscript(transcript, intent);
}
