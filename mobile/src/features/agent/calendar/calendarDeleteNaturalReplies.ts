export type CalendarDeleteLocale = 'ru' | 'en' | 'uk';

export function buildCalendarDeleteNotFoundReply(locale: CalendarDeleteLocale) {
  if (locale === 'uk') {
    return 'Я не знайшов таку подію в календарі.';
  }

  if (locale === 'ru') {
    return 'Я не нашёл такое событие в календаре.';
  }

  return 'I could not find that event on your calendar.';
}

export function buildCalendarDeleteApiFailureReply(
  locale: CalendarDeleteLocale,
  reason: string,
) {
  const detail = reason.trim() || 'unknown error';

  if (locale === 'uk') {
    return `Не вдалося видалити: Google Calendar повернув помилку: ${detail}. Я не змінював ваш календар.`;
  }

  if (locale === 'ru') {
    return `Не удалось удалить: Google Calendar вернул ошибку: ${detail}. Я не менял ваш календар.`;
  }

  return `Could not delete because Google Calendar returned error: ${detail}. I did not change your calendar.`;
}

export function buildCalendarDeleteAmbiguousReply(locale: CalendarDeleteLocale) {
  if (locale === 'uk') {
    return 'Я знайшов кілька схожих подій. Яку саме видалити?';
  }

  if (locale === 'ru') {
    return 'Я нашёл несколько похожих событий. Какое именно удалить?';
  }

  return 'I found several similar events. Which one should I delete?';
}

export function buildCalendarDeleteRecurringNotSupportedReply(locale: CalendarDeleteLocale) {
  if (locale === 'uk') {
    return 'Повторювані події поки не підтримуються для видалення. Уточніть, будь ласка, одну конкретну подію.';
  }

  if (locale === 'ru') {
    return 'Повторяющиеся события пока не поддерживаются для удаления.';
  }

  return 'Recurring events are not supported for deletion yet. Please specify a single event.';
}

export function buildCalendarDeleteAllDayNotSupportedReply(locale: CalendarDeleteLocale) {
  if (locale === 'uk') {
    return 'Події на весь день поки не підтримуються для видалення.';
  }

  if (locale === 'ru') {
    return 'События на весь день пока не поддерживаются для удаления.';
  }

  return 'All-day events are not supported for deletion yet.';
}
