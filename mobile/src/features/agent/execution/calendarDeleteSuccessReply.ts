import type { VerifiedCalendarEvent } from '@/src/features/agent/execution/actionExecutionTypes';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { getChatLocaleFromVoiceLanguage } from '@/src/features/chat/services/voiceLanguage';
import { formatTimeInLocalTimezone } from '@/src/features/agent/calendar/calendarTime';

function isSameCalendarDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function isTomorrow(start: Date, referenceNow: Date) {
  const tomorrow = new Date(referenceNow);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const startDay = new Date(start);
  startDay.setHours(0, 0, 0, 0);

  return startDay.getTime() === tomorrow.getTime();
}

function formatDayPhrase(start: Date, referenceNow: Date, locale: 'uk' | 'ru' | 'en') {
  if (isSameCalendarDay(start, referenceNow)) {
    if (locale === 'uk') {
      return 'сьогодні';
    }

    if (locale === 'ru') {
      return 'сегодня';
    }

    return 'today';
  }

  if (isTomorrow(start, referenceNow)) {
    if (locale === 'uk') {
      return 'завтра';
    }

    if (locale === 'ru') {
      return 'завтра';
    }

    return 'tomorrow';
  }

  const intlLocale = locale === 'ru' ? 'ru-RU' : locale === 'uk' ? 'uk-UA' : 'en-US';

  return start.toLocaleDateString(intlLocale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export function buildNaturalCalendarDeleteSuccessReply(params: {
  event: VerifiedCalendarEvent;
  languageCode: VoiceLanguageCode;
  referenceNow?: Date;
}) {
  const locale = getChatLocaleFromVoiceLanguage(params.languageCode);
  const referenceNow = params.referenceNow ?? new Date();
  const title = params.event.summary.trim();
  const startMs = Date.parse(params.event.startsAt);
  const start = Number.isNaN(startMs) ? referenceNow : new Date(startMs);
  const dayPhrase = formatDayPhrase(start, referenceNow, locale);
  const timeLabel = formatTimeInLocalTimezone(params.event.startsAt);

  if (locale === 'uk') {
    const spokenReply = `Я видалив подію: ${title}, ${dayPhrase}, ${timeLabel}.`;
    return {
      reply: spokenReply,
      spokenReply,
    };
  }

  if (locale === 'ru') {
    const spokenReply = `Событие удалено: ${title}, ${dayPhrase}, ${timeLabel}.`;
    return {
      reply: spokenReply,
      spokenReply,
    };
  }

  const spokenReply = `I deleted the event: ${title}, ${dayPhrase}, ${timeLabel}.`;
  return {
    reply: spokenReply,
    spokenReply,
  };
}
