import { resumePendingCalendarActionAfterAuth } from '@/src/features/agent/calendar/calendarOAuthExecutionService';
import { buildOutcomeFromVerifiedBackendEvent } from '@/src/features/agent/execution/calendarCreateEventExecutor';
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

  const outcome = buildOutcomeFromVerifiedBackendEvent(resolvedLanguage, {
    id: resumed.event.id,
    summary: resumed.event.summary,
    location: resumed.event.location,
    startsAt: resumed.event.startsAt,
    endsAt: resumed.event.endsAt,
    htmlLink: resumed.event.htmlLink,
  });
  const reply = outcome.reply;
  const assistantMessage = createConversationMessage('assistant', reply);
  useExecutiveConversationStore.getState().upsertAssistantMessage(assistantMessage.id, reply);
  await useExecutiveConversationStore.getState().persist();

  return reply;
}
