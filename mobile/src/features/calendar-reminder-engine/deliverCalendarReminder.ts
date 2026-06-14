import { devConsoleLog } from '@/src/shared/logging/devConsoleLog';
import { buildCalendarReminderAnnouncement } from '@/src/features/calendar-reminder-engine/calendarReminderAnnouncement';
import {
  buildActiveCalendarReminderNotification,
  tryPresentSystemNotification,
} from '@/src/features/calendar-reminder-engine/calendarReminderNotifier';
import { CALENDAR_REMINDER_OFFSET_MINUTES } from '@/src/features/calendar-reminder-engine/constants';
import type { ActiveCalendarReminderNotification } from '@/src/features/calendar-reminder-engine/types';
import {
  getChatLocaleFromVoiceLanguage,
  type VoiceLanguageCode,
} from '@/src/features/chat/services/voiceLanguageLocale';
import { speakText } from '@/src/features/chat/services/speechSynthesis';

export async function deliverCalendarReminderAnnouncement(params: {
  eventId: string;
  eventTitle: string;
  startsAt: string;
  languageCode: VoiceLanguageCode;
  offsetMinutes?: number;
  source?: string;
}): Promise<ActiveCalendarReminderNotification> {
  const offsetMinutes = params.offsetMinutes ?? CALENDAR_REMINDER_OFFSET_MINUTES;
  const locale = getChatLocaleFromVoiceLanguage(params.languageCode);
  const message = buildCalendarReminderAnnouncement({
    eventTitle: params.eventTitle,
    locale,
    offsetMinutes,
  });

  const notification = buildActiveCalendarReminderNotification({
    eventId: params.eventId,
    eventTitle: params.eventTitle,
    message,
    startsAt: params.startsAt,
  });

  devConsoleLog('CALENDAR_REMINDER_TRIGGERED', {
    source: params.source ?? 'engine',
    eventId: params.eventId,
    title: params.eventTitle,
    startsAt: params.startsAt,
    offsetMinutes,
    message,
  });

  tryPresentSystemNotification({
    title: 'Calendar reminder',
    body: message,
  });

  speakText(message, {
    languageCode: params.languageCode,
    lang: params.languageCode,
    conversational: true,
  });

  return notification;
}
