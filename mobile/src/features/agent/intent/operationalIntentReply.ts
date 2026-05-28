import type { AssistantExecutionState } from '@/src/features/agent/conversation/assistantExecutionObservability';
import {
  classifyAssistantIntent,
  detectHardOperationalIntent,
  type AssistantIntentAnalysis,
} from '@/src/features/agent/intent/assistantIntentRouter';
import { executeCalendarOperationalPlanner } from '@/src/features/agent/intent/calendarOperationalPlanner';
import { isOperationalCalendarWriteRequest } from '@/src/features/agent/intent/operationalCalendarWriteDetection';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { getChatLocaleFromVoiceLanguage } from '@/src/features/chat/services/voiceLanguage';

export type OperationalIntentReplyParams = {
  transcript: string;
  languageCode: VoiceLanguageCode;
  calendarConnected: boolean;
  referenceNow: Date;
};

export type OperationalIntentResult = {
  reply: string;
  executionState: AssistantExecutionState;
};

function buildMessageDraftReply(params: OperationalIntentReplyParams) {
  const locale = getChatLocaleFromVoiceLanguage(params.languageCode);

  if (locale === 'uk') {
    return 'Текст готовий — надішлю формулювання, а ти відправиш одним дотиком, як тільки SMS підключимо.';
  }

  if (locale === 'ru') {
    return 'Текст готов — дам формулировку, а ты отправишь одним касанием, как только SMS подключим.';
  }

  return 'The message is ready — I will give you the wording, and you can send it in one tap once SMS is connected.';
}

function buildGenericOperationalReply(params: OperationalIntentReplyParams, analysis: AssistantIntentAnalysis) {
  const locale = getChatLocaleFromVoiceLanguage(params.languageCode);
  const subtype = analysis.operationalSubtype ?? 'action';

  if (locale === 'uk') {
    return `Зрозумів запит (${subtype}) — підготую наступний крок; автоматично виконаю, коли канал буде підключений.`;
  }

  if (locale === 'ru') {
    return `Понял запрос (${subtype}) — подготовлю следующий шаг; автоматически выполню, когда канал будет подключён.`;
  }

  return `Got the ${subtype} request — I will prepare the next step; automatic execution waits on the channel being connected.`;
}

export async function tryBuildOperationalIntentReply(
  params: OperationalIntentReplyParams,
): Promise<OperationalIntentResult | null> {
  const analysis = classifyAssistantIntent(params.transcript);

  if (!analysis.shouldBypassEmotionalRouting && !detectHardOperationalIntent(params.transcript)) {
    return null;
  }

  if (analysis.operationalSubtype === 'reminder') {
    return null;
  }

  const plannerResult = await executeCalendarOperationalPlanner(params);

  if (plannerResult) {
    return {
      reply: plannerResult.reply,
      executionState: plannerResult.state,
    };
  }

  if (isOperationalCalendarWriteRequest(params.transcript)) {
    return {
      reply: buildGenericOperationalReply(params, analysis),
      executionState: 'tool_failure',
    };
  }

  if (analysis.operationalSubtype === 'message_draft') {
    return {
      reply: buildMessageDraftReply(params),
      executionState: 'conversational',
    };
  }

  return {
    reply: buildGenericOperationalReply(params, analysis),
    executionState: 'planning',
  };
}
