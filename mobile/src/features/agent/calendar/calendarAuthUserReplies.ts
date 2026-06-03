import type { CalendarToolErrorCode } from '@/src/features/agent/execution/calendarToolContract';

export type CalendarUserReplyLocale = 'en' | 'uk' | 'ru';

export function resolveCalendarUserReplyLocale(languageCode: string): CalendarUserReplyLocale {
  if (languageCode.startsWith('uk')) {
    return 'uk';
  }

  if (languageCode.startsWith('ru')) {
    return 'ru';
  }

  return 'en';
}

export function buildCalendarAuthRequiredReply(languageCode: string) {
  const locale = resolveCalendarUserReplyLocale(languageCode);

  if (locale === 'uk') {
    return 'Потрібно знову підключити Google Calendar. Натисніть кнопку підключення.';
  }

  if (locale === 'ru') {
    return 'Нужно снова подключить Google Calendar. Нажмите кнопку подключения.';
  }

  return 'Please reconnect Google Calendar using the connect button.';
}

export function buildCalendarWriteScopeMissingReply(languageCode: string) {
  const locale = resolveCalendarUserReplyLocale(languageCode);

  if (locale === 'uk') {
    return 'Потрібен доступ на запис до календаря. Перепідключіть Google Calendar і надайте дозвіл на редагування подій.';
  }

  if (locale === 'ru') {
    return 'Нужен доступ на запись в календарь. Переподключите Google Calendar и разрешите редактирование событий.';
  }

  return 'Calendar write access is required. Reconnect Google Calendar and grant permission to edit events.';
}

export function buildCalendarApiUnavailableReply(languageCode: string) {
  const locale = resolveCalendarUserReplyLocale(languageCode);

  if (locale === 'uk') {
    return 'Зараз не вдається звернутися до Google Calendar. Спробуйте ще раз за хвилину.';
  }

  if (locale === 'ru') {
    return 'Сейчас не удаётся обратиться к Google Calendar. Попробуйте ещё раз через минуту.';
  }

  return 'Google Calendar is temporarily unavailable. Please try again in a moment.';
}

export function buildCalendarQueryUncertainReply(languageCode: string) {
  const locale = resolveCalendarUserReplyLocale(languageCode);

  if (locale === 'uk') {
    return 'Не можу надійно перевірити календар зараз. Спробуйте перепідключити Google Calendar.';
  }

  if (locale === 'ru') {
    return 'Не могу надёжно проверить календарь сейчас. Попробуйте переподключить Google Calendar.';
  }

  return "I can't reliably check your calendar right now. Try reconnecting Google Calendar.";
}

export function buildCalendarToolUserReply(
  tool: { status: string; errorCode?: CalendarToolErrorCode | null; error?: string | null },
  languageCode: string,
): string | null {
  const code = tool.errorCode;

  if (code === 'CALENDAR_AUTH_REQUIRED') {
    return buildCalendarAuthRequiredReply(languageCode);
  }

  if (
    code === 'WRITE_SCOPE_MISSING' ||
    code === 'GOOGLE_CALENDAR_WRITE_NOT_GRANTED' ||
    code === 'GOOGLE_WRITE_PERMISSION_MISSING'
  ) {
    return buildCalendarWriteScopeMissingReply(languageCode);
  }

  if (code === 'CALENDAR_API_UNAVAILABLE') {
    return buildCalendarApiUnavailableReply(languageCode);
  }

  return null;
}
