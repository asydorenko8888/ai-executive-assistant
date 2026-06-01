import { buildCalendarConflictCancelledReply } from '@/src/features/agent/calendar/calendarConflictReplies';
import {
  mapPendingActionTypeToCommandIntent,
  resetCalendarConversationState,
  type CalendarPendingAction,
} from '@/src/features/agent/calendar/calendarConversationState';
import {
  clearPendingCalendarConflictContext,
  clearPendingCalendarDeleteIntent,
  clearPendingCalendarUpdateIntent,
} from '@/src/features/agent/execution/calendarExecutionSession';
import { createCalendarToolFailure } from '@/src/features/agent/execution/calendarToolContract';
import { getChatLocaleFromVoiceLanguage } from '@/src/features/chat/services/voiceLanguage';

export function cancelCalendarConversation(pending: CalendarPendingAction, incomingMessage?: string) {
  resetCalendarConversationState('user_cancelled', incomingMessage ?? 'cancel');
  clearPendingCalendarConflictContext();
  clearPendingCalendarUpdateIntent();
  clearPendingCalendarDeleteIntent();

  const locale = getChatLocaleFromVoiceLanguage(pending.languageCode);
  const reply = buildCalendarConflictCancelledReply(locale);
  const intent = mapPendingActionTypeToCommandIntent(pending.action);
  const tool = createCalendarToolFailure('CALENDAR_SCHEDULE_CONFLICT', 'User cancelled pending calendar action');

  return {
    intent,
    tool,
    reply,
    spokenReply: reply,
    verified: false as const,
  };
}
