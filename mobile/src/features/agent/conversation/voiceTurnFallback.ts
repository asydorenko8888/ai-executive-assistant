import type { AssistantIntentAnalysis } from '@/src/features/agent/intent/assistantIntentRouter';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguageLocale';
import { getChatLocaleFromVoiceLanguage } from '@/src/features/chat/services/voiceLanguageLocale';

export const UNRECOGNIZED_COMMAND_FALLBACK = {
  ru: 'Я не понял команду. Попробуй сказать иначе.',
  uk: 'Я не зрозуміла команду. Спробуй сказати інакше.',
  en: "I didn't understand that command. Try saying it another way.",
} as const;

const NOISE_TRANSCRIPT =
  /^(?:[\s,.;:!?…—-]+|\d+|[а-яёіїєґa-z]{1,2})$/iu;

const MEANINGLESS_TRANSCRIPT =
  /^(?:ммм+|эээ+|uh+|um+|hmm+|ага+|ну+)[\s,.!?]*$/iu;

export function buildUnrecognizedCommandFallbackReply(languageCode: VoiceLanguageCode) {
  const locale = getChatLocaleFromVoiceLanguage(languageCode);

  if (locale === 'uk') {
    return UNRECOGNIZED_COMMAND_FALLBACK.uk;
  }

  if (locale === 'ru') {
    return UNRECOGNIZED_COMMAND_FALLBACK.ru;
  }

  return UNRECOGNIZED_COMMAND_FALLBACK.en;
}

export function logVoiceTurnStart(params: {
  source: 'chat' | 'home_voice';
  languageCode: VoiceLanguageCode;
}) {
  console.log(
    'VOICE_TURN_START',
    JSON.stringify({
      source: params.source,
      languageCode: params.languageCode,
    }),
  );
}

export function logTranscriptReceived(params: {
  transcript: string;
  source: 'chat' | 'home_voice';
}) {
  console.log(
    'TRANSCRIPT_RECEIVED',
    JSON.stringify({
      source: params.source,
      transcriptPreview: params.transcript.slice(0, 160),
      length: params.transcript.length,
    }),
  );
}

export function logIntentClassificationFailed(params: {
  transcript: string;
  error: unknown;
}) {
  console.log(
    'INTENT_CLASSIFICATION_FAILED',
    JSON.stringify({
      transcriptPreview: params.transcript.slice(0, 160),
      message: params.error instanceof Error ? params.error.message : String(params.error),
    }),
  );
}

export function logRouteHandlerFailed(params: {
  handler: string;
  transcript: string;
  error: unknown;
}) {
  console.log(
    'ROUTE_HANDLER_FAILED',
    JSON.stringify({
      handler: params.handler,
      transcriptPreview: params.transcript.slice(0, 160),
      message: params.error instanceof Error ? params.error.message : String(params.error),
    }),
  );
}

export function logFallbackReplyBuilt(params: {
  reason: string;
  transcript: string;
  languageCode: VoiceLanguageCode;
}) {
  console.log(
    'FALLBACK_REPLY_BUILT',
    JSON.stringify({
      reason: params.reason,
      transcriptPreview: params.transcript.slice(0, 160),
      languageCode: params.languageCode,
    }),
  );
}

export function createEmptyIntentAnalysis(): AssistantIntentAnalysis {
  return {
    primary: 'conversational',
    operationalSubtype: null,
    scores: {
      operational: 0,
      clarification: 0,
      conversational: 0,
      emotional: 0,
      reflective: 0,
    },
    actionConfidence: 0,
    conversationalConfidence: 0,
    shouldBypassEmotionalRouting: false,
    hasHardOperationalIntent: false,
  };
}

export function isLowConfidenceUnrecognizedTranscript(
  transcript: string,
  intent: AssistantIntentAnalysis,
) {
  const normalized = transcript.trim();

  if (!normalized) {
    return true;
  }

  if (NOISE_TRANSCRIPT.test(normalized) || MEANINGLESS_TRANSCRIPT.test(normalized)) {
    return true;
  }

  const maxScore = Math.max(...Object.values(intent.scores));

  return (
    maxScore < 0.18 &&
    intent.actionConfidence < 0.18 &&
    intent.conversationalConfidence < 0.22 &&
    !intent.hasHardOperationalIntent
  );
}

export async function safeRouteHandler<T>(params: {
  handler: string;
  transcript: string;
  run: () => Promise<T>;
}): Promise<T | null> {
  try {
    return await params.run();
  } catch (error) {
    logRouteHandlerFailed({
      handler: params.handler,
      transcript: params.transcript,
      error,
    });
    return null;
  }
}

export function buildFallbackAssistantTurnResolution(params: {
  languageCode: VoiceLanguageCode;
  userTranscript: string;
  userMessageId: string | null;
  reason: string;
  intent?: AssistantIntentAnalysis;
}) {
  const intent = params.intent ?? createEmptyIntentAnalysis();
  const reply = buildUnrecognizedCommandFallbackReply(params.languageCode);

  logFallbackReplyBuilt({
    reason: params.reason,
    transcript: params.userTranscript,
    languageCode: params.languageCode,
  });

  return {
    route: 'advisory_local' as const,
    intent,
    reply,
    intentPrompt: null,
    userTranscript: params.userTranscript,
    latestUserMessageId: params.userMessageId,
    executionState: 'conversational' as const,
    operationalStarted: false,
    spokenReply: reply,
    calendarVerified: false,
    responseMode: 'conversational' as const,
    factualGroundingStatus: 'unavailable' as const,
    behaviorMode: 'COMPANION_MODE' as const,
    selectedTool: 'none',
  };
}
