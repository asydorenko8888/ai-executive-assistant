import type { VerifiedCalendarEvent } from '@/src/features/agent/execution/actionExecutionTypes';
import { logCalendarCreate } from '@/src/features/agent/execution/calendarCreateLogger';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { getChatLocaleFromVoiceLanguage } from '@/src/features/chat/services/voiceLanguage';

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

function formatTimePhrase(start: Date, locale: 'uk' | 'ru' | 'en') {
  const hours = start.getHours();
  const minutes = start.getMinutes();
  const hour12 = hours % 12 || 12;
  const clock =
    minutes > 0
      ? `${hour12}:${String(minutes).padStart(2, '0')}`
      : `${hour12}`;

  if (locale === 'uk') {
    if (hours >= 17) {
      return `${clock} вечора`;
    }

    if (hours >= 12) {
      return `${clock} дня`;
    }

    if (hours >= 5) {
      return `${clock} ранку`;
    }

    return `${clock} ночі`;
  }

  if (locale === 'ru') {
    if (hours >= 17) {
      return `${clock} вечера`;
    }

    if (hours >= 12) {
      return `${clock} дня`;
    }

    if (hours >= 5) {
      return `${clock} утра`;
    }

    return `${clock} ночи`;
  }

  return start.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function buildNaturalCalendarCreateSuccessReply(params: {
  event: VerifiedCalendarEvent;
  languageCode: VoiceLanguageCode;
  referenceNow?: Date;
}) {
  const locale = getChatLocaleFromVoiceLanguage(params.languageCode);
  const referenceNow = params.referenceNow ?? new Date();
  const startMs = Date.parse(params.event.startsAt);
  const start = Number.isNaN(startMs) ? referenceNow : new Date(startMs);
  const exactTitle = params.event.summary.trim();
  const dayPhrase = formatDayPhrase(start, referenceNow, locale);
  const timePhrase = formatTimePhrase(start, locale);
  const scheduleLabel = `${dayPhrase}, ${timePhrase}`;

  let reply = '';

  if (locale === 'uk') {
    reply = `Готово. Я додав: ${exactTitle} — ${scheduleLabel}.`;
  } else if (locale === 'ru') {
    reply = `Готово. Я добавил: ${exactTitle} — ${scheduleLabel}.`;
  } else {
    reply = `Done. I added: ${exactTitle} — ${scheduleLabel}.`;
  }

  logCalendarCreate('success reply', {
    eventId: params.event.id,
    summary: exactTitle,
    startsAt: params.event.startsAt,
    reply,
  });

  return {
    reply,
    spokenReply: reply,
  };
}
