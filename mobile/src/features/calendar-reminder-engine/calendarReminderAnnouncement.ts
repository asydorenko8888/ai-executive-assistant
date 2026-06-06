import { CALENDAR_REMINDER_OFFSET_MINUTES } from '@/src/features/calendar-reminder-engine/constants';
import type { VoiceLanguageChatLocale } from '@/src/features/chat/services/voiceLanguageLocale';

export function buildCalendarReminderAnnouncement(params: {
  eventTitle: string;
  locale: VoiceLanguageChatLocale;
  offsetMinutes?: number;
}): string {
  const offset = params.offsetMinutes ?? CALENDAR_REMINDER_OFFSET_MINUTES;
  const title = params.eventTitle.trim() || 'Подія';

  if (params.locale === 'uk') {
    return `Через ${offset} хвилин у вас подія: ${title}.`;
  }

  if (params.locale === 'ru') {
    return `Через ${offset} минут у вас событие: ${title}.`;
  }

  return `In ${offset} minutes you have: ${title}.`;
}
