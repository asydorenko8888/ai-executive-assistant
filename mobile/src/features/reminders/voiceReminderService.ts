import type { ReminderItem } from '@/src/entities/reminder/types';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { loadAgentReminders, saveAgentReminders } from '@/src/features/agent/storage/agentWorkspaceStorage';
import type { ParsedReminderIntent } from '@/src/features/reminders/reminderIntentParser';
import { formatReminderScheduleLabel } from '@/src/features/reminders/reminderTimeParser';

function createTimestamp() {
  return new Date().toISOString();
}

export function createReminderItemFromIntent(intent: ParsedReminderIntent): ReminderItem {
  const now = createTimestamp();

  return {
    id: `reminder-voice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: intent.title,
    notes: intent.kind === 'before_next_meeting' ? 'voice:before_next_meeting' : 'voice:at_time',
    scheduledFor: intent.scheduledFor.toISOString(),
    leadTimeMinutes: intent.leadTimeMinutes,
    channel: 'in_app',
    recurrence: 'none',
    status: 'scheduled',
    createdAt: now,
    updatedAt: now,
  };
}

export async function scheduleReminderFromIntent(intent: ParsedReminderIntent) {
  const reminder = createReminderItemFromIntent(intent);
  const reminders = await loadAgentReminders();

  await saveAgentReminders([reminder, ...reminders]);

  console.log('[Reminder] Scheduled', {
    id: reminder.id,
    title: reminder.title,
    scheduledFor: reminder.scheduledFor,
  });

  return reminder;
}

export function buildVoiceReminderConfirmation(
  intent: ParsedReminderIntent,
  reminder: ReminderItem,
  languageCode: VoiceLanguageCode,
) {
  const whenLabel = formatReminderScheduleLabel(reminder.scheduledFor);

  if (languageCode === 'uk-UA') {
    if (intent.kind === 'before_next_meeting') {
      return `Добре. Нагадаю ${whenLabel}, за ${intent.leadTimeMinutes} хвилин до наступної зустрічі.`;
    }

    return `Добре. Нагадаю ${whenLabel}: ${reminder.title}.`;
  }

  if (languageCode === 'ru-RU') {
    if (intent.kind === 'before_next_meeting') {
      return `Хорошо. Напомню ${whenLabel}, за ${intent.leadTimeMinutes} минут до следующей встречи.`;
    }

    return `Хорошо. Напомню ${whenLabel}: ${reminder.title}.`;
  }

  if (intent.kind === 'before_next_meeting') {
    return `Got it. I'll remind you ${whenLabel}, ${intent.leadTimeMinutes} minutes before your next meeting.`;
  }

  return `Got it. I'll remind you ${whenLabel} to ${reminder.title}.`;
}
