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

export function buildCalendarUpdateNoTimeChangeReply(
  locale: CalendarUpdateLocale,
  eventTitle: string,
) {
  const title = eventTitle.trim() || 'that event';

  if (locale === 'uk') {
    return `Подія «${title}» уже запланована на цей час.`;
  }

  if (locale === 'ru') {
    return `Событие «${title}» уже запланировано на это время.`;
  }

  return `${title} is already scheduled for that time.`;
}

export function buildCalendarUpdateTimeParseFailedReply(locale: CalendarUpdateLocale) {
  if (locale === 'uk') {
    return 'Я не зрозумів, на який час перенести подію. Спробуйте ще раз, наприклад: «на 20:00» або «на годину пізніше».';
  }

  if (locale === 'ru') {
    return 'Я не понял, на какое время перенести событие. Попробуйте ещё раз, например: «на 20:00» или «на час позже».';
  }

  return 'I could not tell what time you want. Try again, for example: "to 8 PM" or "one hour later".';
}

export function buildCalendarUpdateVerificationFailedReply(locale: CalendarUpdateLocale) {
  if (locale === 'uk') {
    return 'Не вдалося виконати дію. Календар не змінено. Перенесення не підтверджено.';
  }

  if (locale === 'ru') {
    return 'Не удалось выполнить действие. Календарь не изменён. Перенос не подтверждён.';
  }

  return 'Could not complete the action. Your calendar was not changed. Move verification failed.';
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
