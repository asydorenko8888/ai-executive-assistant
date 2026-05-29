export type CalendarUpdateLocale = 'ru' | 'en' | 'uk';

export function buildCalendarUpdateAmbiguousReply(locale: CalendarUpdateLocale) {
  if (locale === 'uk') {
    return 'Я знайшов кілька схожих подій. Яку саме перенести?';
  }

  if (locale === 'ru') {
    return 'Я нашёл несколько похожих событий. Какое именно перенести?';
  }

  return 'I found several similar events. Which one should I update?';
}

export function buildCalendarUpdateNotFoundReply(locale: CalendarUpdateLocale) {
  if (locale === 'uk') {
    return 'Я не знайшов таку подію в календарі.';
  }

  if (locale === 'ru') {
    return 'Я не нашёл такое событие в календаре.';
  }

  return 'I could not find that event on your calendar.';
}
