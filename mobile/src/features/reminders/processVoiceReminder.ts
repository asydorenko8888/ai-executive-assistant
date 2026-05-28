import {
  buildAgentRuntimeContext,
  createExecutiveAgentOrchestrator,
} from '@/src/features/agent';
import type { ChatMessage } from '@/src/entities/chat/types';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { getChatLocaleFromVoiceLanguage } from '@/src/features/chat/services/voiceLanguage';
import { isOperationalCalendarWriteRequest } from '@/src/features/agent/intent/operationalCalendarWriteDetection';
import { parseReminderIntent } from '@/src/features/reminders/reminderIntentParser';
import {
  buildVoiceReminderConfirmation,
  scheduleReminderFromIntent,
} from '@/src/features/reminders/voiceReminderService';

function createUserMessage(content: string): ChatMessage {
  return {
    id: `voice-reminder-${Date.now()}`,
    role: 'user',
    content,
    createdAt: new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    }),
    status: 'sent',
  };
}

export async function processVoiceReminderTranscript(params: {
  transcript: string;
  languageCode: VoiceLanguageCode;
}) {
  if (isOperationalCalendarWriteRequest(params.transcript)) {
    return null;
  }

  const referenceNow = new Date();
  const orchestrator = await createExecutiveAgentOrchestrator({
    locale: getChatLocaleFromVoiceLanguage(params.languageCode),
    chatMessages: [createUserMessage(params.transcript)],
  });
  const nextMeeting = orchestrator.snapshot.calendarSummary?.nextEvent ?? null;

  const intent = parseReminderIntent(params.transcript, {
    referenceNow,
    nextMeeting,
  });

  if (!intent) {
    return null;
  }

  console.log('[Reminder] Intent detected', {
    kind: intent.kind,
    title: intent.title,
    scheduledFor: intent.scheduledFor.toISOString(),
    leadTimeMinutes: intent.leadTimeMinutes,
  });

  const reminder = await scheduleReminderFromIntent(intent);
  const confirmation = buildVoiceReminderConfirmation(intent, reminder, params.languageCode);

  return {
    intent,
    reminder,
    confirmation,
    runtimeContext: buildAgentRuntimeContext(orchestrator),
  };
}
