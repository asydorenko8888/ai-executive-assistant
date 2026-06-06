import {
  getChatLocaleFromVoiceLanguage,
  type VoiceLanguageCode,
} from '@/src/features/chat/services/voiceLanguageLocale';
import { speakText } from '@/src/features/chat/services/speechSynthesis';

function buildDevTestScheduledConfirmation(languageCode: VoiceLanguageCode) {
  const locale = getChatLocaleFromVoiceLanguage(languageCode);

  if (locale === 'uk') {
    return 'Тестове нагадування через 2 хвилини.';
  }

  if (locale === 'ru') {
    return 'Тестовое напоминание через 2 минуты.';
  }

  return 'Test reminder in 2 minutes.';
}

export const CALENDAR_REMINDER_DEV_TEST_DELAY_MS = 2 * 60_000;

const DEV_TEST_EVENT_TITLE = 'Масаж';

export function scheduleCalendarReminderDevTest(params: {
  languageCode: VoiceLanguageCode;
  delayMs?: number;
  trigger: () => Promise<void>;
}): () => void {
  const delayMs = params.delayMs ?? CALENDAR_REMINDER_DEV_TEST_DELAY_MS;
  const startsAt = new Date(Date.now() + delayMs).toISOString();

  console.log('[CalendarReminderEngine] Dev test scheduled', {
    delayMs,
    startsAt,
    eventTitle: DEV_TEST_EVENT_TITLE,
  });

  speakText(buildDevTestScheduledConfirmation(params.languageCode), {
    languageCode: params.languageCode,
    lang: params.languageCode,
    conversational: true,
  });

  const timeoutId = setTimeout(() => {
    void params.trigger();
  }, delayMs);

  return () => {
    clearTimeout(timeoutId);
  };
}

export function getCalendarReminderDevTestPayload(startsAt = new Date(Date.now() + CALENDAR_REMINDER_DEV_TEST_DELAY_MS).toISOString()) {
  return {
    eventId: 'dev-test-reminder',
    eventTitle: DEV_TEST_EVENT_TITLE,
    startsAt,
    offsetMinutes: 30 as const,
    source: 'dev_test' as const,
  };
}
