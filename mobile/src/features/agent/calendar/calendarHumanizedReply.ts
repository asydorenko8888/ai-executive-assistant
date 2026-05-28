import type { CalendarEvent } from '@/src/entities/calendar/types';
import { formatTimeInLocalTimezone, getMinutesUntilEvent } from '@/src/features/agent/calendar/calendarTime';
import type { VoiceLanguageChatLocale, VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { getChatLocaleFromVoiceLanguage } from '@/src/features/chat/services/voiceLanguage';

export type CalendarResponseTone = 'urgent' | 'prepare' | 'calm' | 'none';

export type HumanizedCalendarReplyResult = {
  responseText: string;
  responseTone: CalendarResponseTone;
  nextEvent: CalendarEvent | null;
  minutesUntilNextEvent: number | null;
};

const CALENDAR_SCHEDULE_QUESTION_PATTERNS = [
  /\bwhat do i have planned\b/i,
  /\bwhat(?:'s| is) on my (?:calendar|schedule)\b/i,
  /\b(?:my )?(?:next|nearest|upcoming)\s+(?:event|meeting)\b/i,
  /\bplanned(?: for)? today\b/i,
  /\bschedule(?: for)? today\b/i,
  /\bmeetings? today\b/i,
  /найближч/i,
  /поді[яіє]/i,
  /зустріч/i,
  /сьогодні/i,
  /запланован/i,
  /розклад/i,
  /календар/i,
  /ближайш/i,
  /событи/i,
  /встреч/i,
  /сегодня/i,
  /расписан/i,
  /календар/i,
];

const REMINDER_QUESTION_PATTERNS = [
  /\bremind(?: me)?\b/i,
  /\bнагад/i,
  /\bнапомни/i,
];

function isGenericMeetingTitle(title: string) {
  const normalized = title.trim().toLowerCase();

  return (
    normalized === 'meeting' ||
    normalized === 'event' ||
    normalized === 'untitled event' ||
    normalized === 'зустріч' ||
    normalized === 'встреча' ||
    normalized.startsWith('meeting at') ||
    normalized.startsWith('meeting —') ||
    normalized.startsWith('meeting -')
  );
}

export function isCalendarScheduleQuestion(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized) {
    return false;
  }

  if (REMINDER_QUESTION_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return false;
  }

  return CALENDAR_SCHEDULE_QUESTION_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function resolveCalendarResponseTone(minutesUntilNextEvent: number | null): CalendarResponseTone {
  if (minutesUntilNextEvent === null) {
    return 'none';
  }

  if (minutesUntilNextEvent <= 10) {
    return 'urgent';
  }

  if (minutesUntilNextEvent <= 30) {
    return 'prepare';
  }

  return 'calm';
}

function formatMinutesLabel(minutes: number, locale: VoiceLanguageChatLocale) {
  const safeMinutes = Math.max(1, Math.round(minutes));

  if (locale === 'uk') {
    const remainder10 = safeMinutes % 10;
    const remainder100 = safeMinutes % 100;

    if (remainder10 === 1 && remainder100 !== 11) {
      return `${safeMinutes} хвилину`;
    }

    if (remainder10 >= 2 && remainder10 <= 4 && (remainder100 < 10 || remainder100 >= 20)) {
      return `${safeMinutes} хвилини`;
    }

    return `${safeMinutes} хвилин`;
  }

  if (locale === 'ru') {
    const remainder10 = safeMinutes % 10;
    const remainder100 = safeMinutes % 100;

    if (remainder10 === 1 && remainder100 !== 11) {
      return `${safeMinutes} минуту`;
    }

    if (remainder10 >= 2 && remainder10 <= 4 && (remainder100 < 10 || remainder100 >= 20)) {
      return `${safeMinutes} минуты`;
    }

    return `${safeMinutes} минут`;
  }

  return `${safeMinutes} minute${safeMinutes === 1 ? '' : 's'}`;
}

function formatEventMention(event: CalendarEvent, locale: VoiceLanguageChatLocale) {
  const time = formatTimeInLocalTimezone(event.startsAt);
  const location = event.location?.trim();
  const label = isGenericMeetingTitle(event.title)
    ? locale === 'uk'
      ? 'зустріч'
      : locale === 'ru'
        ? 'встреча'
        : 'meeting'
    : event.title;

  if (locale === 'uk') {
    return location ? `${label} о ${time} в ${location}` : `${label} о ${time}`;
  }

  if (locale === 'ru') {
    return location ? `${label} в ${time} в ${location}` : `${label} в ${time}`;
  }

  return location ? `${label} at ${time} in ${location}` : `${label} at ${time}`;
}

function buildEmptyDayReply(locale: VoiceLanguageChatLocale) {
  if (locale === 'uk') {
    return 'На сьогодні більше немає запланованих подій у календарі.';
  }

  if (locale === 'ru') {
    return 'На сегодня больше нет запланированных событий в календаре.';
  }

  return 'You have no more scheduled events on your calendar for today.';
}

function formatNextMeetingLead(
  event: CalendarEvent,
  locale: VoiceLanguageChatLocale,
  tone: CalendarResponseTone,
) {
  const time = formatTimeInLocalTimezone(event.startsAt);
  const location = event.location?.trim();

  if (locale === 'uk') {
    if (tone === 'calm') {
      return `Найближча подія сьогодні — ${formatEventMention(event, locale)}.`;
    }

    const locationSuffix = location ? ` в ${location}` : '';
    return `Найближча зустріч о ${time}${locationSuffix}`;
  }

  if (locale === 'ru') {
    if (tone === 'calm') {
      return `Ближайшее событие сегодня — ${formatEventMention(event, locale)}.`;
    }

    const locationSuffix = location ? ` в ${location}` : '';
    return `Ближайшая встреча в ${time}${locationSuffix}`;
  }

  if (tone === 'calm') {
    return `Your next event today is ${formatEventMention(event, locale)}.`;
  }

  const locationSuffix = location ? ` in ${location}` : '';
  return `Your next meeting is at ${time}${locationSuffix}`;
}

function buildHumanizedReplyBody(params: {
  visibleEvents: CalendarEvent[];
  locale: VoiceLanguageChatLocale;
  tone: CalendarResponseTone;
  minutesUntilNextEvent: number | null;
}) {
  const nextEvent = params.visibleEvents[0];
  const followingEvents = params.visibleEvents.slice(1);
  const lead = formatNextMeetingLead(nextEvent, params.locale, params.tone);
  const minutesLabel =
    params.minutesUntilNextEvent === null
      ? null
      : formatMinutesLabel(params.minutesUntilNextEvent, params.locale);

  if (params.locale === 'uk') {
    const intro =
      params.tone === 'urgent'
        ? 'Друже, тобі вже треба збиратись.'
        : params.tone === 'prepare'
          ? 'Друже, тобі варто вже готуватись.'
          : 'Друже, ось що в тебе на сьогодні.';

    const urgency =
      minutesLabel && params.tone !== 'calm'
        ? `, і до неї залишилось приблизно ${minutesLabel}`
        : '';

    const following =
      followingEvents.length === 0
        ? '.'
        : `. Після цього в тебе ще ${followingEvents
            .map((event) => formatEventMention(event, params.locale))
            .join(', а також ')}.`;

    return `${intro} ${lead}${urgency}${following}`;
  }

  if (params.locale === 'ru') {
    const intro =
      params.tone === 'urgent'
        ? 'Слушай, тебе уже пора собираться.'
        : params.tone === 'prepare'
          ? 'Тебе уже стоит начать готовиться.'
          : 'Вот что у тебя на сегодня.';

    const urgency =
      minutesLabel && params.tone !== 'calm'
        ? `, до неё осталось примерно ${minutesLabel}`
        : '';

    const following =
      followingEvents.length === 0
        ? '.'
        : `. После этого у тебя ещё ${followingEvents
            .map((event) => formatEventMention(event, params.locale))
            .join(', а также ')}.`;

    return `${intro} ${lead}${urgency}${following}`;
  }

  const intro =
    params.tone === 'urgent'
      ? 'Hey — you should start getting ready.'
      : params.tone === 'prepare'
        ? 'You should start preparing soon.'
        : "Here's what's on your calendar today.";

  const urgency =
    minutesLabel && params.tone !== 'calm'
      ? `, with about ${minutesLabel} left before it starts`
      : '';

  const following =
    followingEvents.length === 0
      ? '.'
      : `. After that, you also have ${followingEvents
          .map((event) => formatEventMention(event, params.locale))
          .join(', and ')}.`;

  return `${intro} ${lead}${urgency}${following}`;
}

export function tryBuildHumanizedCalendarReply(params: {
  transcript: string;
  visibleEvents: CalendarEvent[];
  languageCode: VoiceLanguageCode;
  referenceNow: Date;
}): HumanizedCalendarReplyResult | null {
  if (!isCalendarScheduleQuestion(params.transcript)) {
    return null;
  }

  const locale = getChatLocaleFromVoiceLanguage(params.languageCode);

  if (params.visibleEvents.length === 0) {
    const responseText = buildEmptyDayReply(locale);
    const result: HumanizedCalendarReplyResult = {
      responseText,
      responseTone: 'none',
      nextEvent: null,
      minutesUntilNextEvent: null,
    };

    console.log('[Voice Humanized] nextEvent', null);
    console.log('[Voice Humanized] minutesUntilNextEvent', null);
    console.log('[Voice Humanized] responseTone', result.responseTone);
    console.log('[Voice Humanized] responseText', result.responseText);

    return result;
  }

  const nextEvent = params.visibleEvents[0];
  const minutesUntilNextEvent = getMinutesUntilEvent(nextEvent.startsAt, params.referenceNow);
  const responseTone = resolveCalendarResponseTone(minutesUntilNextEvent);
  const responseText = buildHumanizedReplyBody({
    visibleEvents: params.visibleEvents,
    locale,
    tone: responseTone,
    minutesUntilNextEvent,
  });

  const result: HumanizedCalendarReplyResult = {
    responseText,
    responseTone,
    nextEvent,
    minutesUntilNextEvent,
  };

  console.log('[Voice Humanized] nextEvent', {
    title: nextEvent.title,
    startsAt: nextEvent.startsAt,
    location: nextEvent.location ?? null,
  });
  console.log('[Voice Humanized] minutesUntilNextEvent', minutesUntilNextEvent);
  console.log('[Voice Humanized] responseTone', responseTone);
  console.log('[Voice Humanized] responseText', responseText);

  return result;
}

export function buildHumanizedCalendarGuidanceLine(params: {
  visibleEvents: CalendarEvent[];
  languageCode: VoiceLanguageCode;
  referenceNow: Date;
}): string {
  if (params.visibleEvents.length === 0) {
    return '';
  }

  const nextEvent = params.visibleEvents[0];
  const minutesUntilNextEvent = getMinutesUntilEvent(nextEvent.startsAt, params.referenceNow);
  const tone = resolveCalendarResponseTone(minutesUntilNextEvent);
  const locale = getChatLocaleFromVoiceLanguage(params.languageCode);

  if (locale === 'uk') {
    if (tone === 'urgent') {
      return 'Speak naturally in Ukrainian like a close executive assistant. The next event is very soon — sound warm and urgent (e.g. "Друже, тобі вже треба збиратись"). Mention only listed events.';
    }

    if (tone === 'prepare') {
      return 'Speak naturally in Ukrainian. The next event is within 30 minutes — suggest preparing now. Mention only listed events.';
    }

    return 'Speak naturally in Ukrainian with a calm, human tone. Summarize only the listed events.';
  }

  if (locale === 'ru') {
    if (tone === 'urgent') {
      return 'Speak naturally in Russian. The next event is very soon — sound warm and urgent. Mention only listed events.';
    }

    if (tone === 'prepare') {
      return 'Speak naturally in Russian. The next event is within 30 minutes — suggest preparing. Mention only listed events.';
    }

    return 'Speak naturally in Russian with a calm tone. Summarize only the listed events.';
  }

  if (tone === 'urgent') {
    return 'Speak naturally in English. The next event is very soon — sound warm and urgent. Mention only listed events.';
  }

  if (tone === 'prepare') {
    return 'Speak naturally in English. The next event is within 30 minutes — suggest preparing. Mention only listed events.';
  }

  return 'Speak naturally in English with a calm tone. Summarize only the listed events.';
}
