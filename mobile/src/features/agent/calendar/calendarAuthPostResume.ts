import { resumePendingCalendarActionAfterAuth } from '@/src/features/agent/calendar/calendarOAuthExecutionService';
import { buildSuccessReplyFromVerifiedEvent } from '@/src/features/agent/execution/calendarCreateEventExecutor';
import { loadLocalPendingCalendarAction } from '@/src/features/agent/execution/pendingActionQueue';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import {
  createConversationMessage,
  useExecutiveConversationStore,
} from '@/src/features/chat/store/executiveConversationStore';

export async function appendResumedCalendarActionReply(languageCode?: VoiceLanguageCode) {
  const pending = await loadLocalPendingCalendarAction();
  const resolvedLanguage = languageCode ?? pending?.languageCode ?? 'en-US';
  const resumed = await resumePendingCalendarActionAfterAuth(resolvedLanguage);

  if (!resumed) {
    return null;
  }

  const reply = buildSuccessReplyFromVerifiedEvent(resolvedLanguage, resumed.event);
  const assistantMessage = createConversationMessage('assistant', reply);
  useExecutiveConversationStore.getState().upsertAssistantMessage(assistantMessage.id, reply);
  await useExecutiveConversationStore.getState().persist();

  return reply;
}
