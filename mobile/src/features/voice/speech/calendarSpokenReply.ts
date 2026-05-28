import type { CalendarEvent } from '@/src/entities/calendar/types';
import { getMinutesUntilEvent, parseGoogleCalendarInstant } from '@/src/features/agent/calendar/calendarTime';
import type { VoiceLanguageChatLocale, VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { getChatLocaleFromVoiceLanguage } from '@/src/features/chat/services/voiceLanguage';
import {
  formatSpokenMinutesUntil,
  formatVoiceResponse,
  joinSpokenClauses,
  resolveSpokenDayLoad,
  resolveSpokenUrgency,
  type SpokenDayLoad,
  type SpokenUrgency,
} from '@/src/features/voice/speech/voiceSpeechFormatter';

export type { SpokenUrgency, SpokenDayLoad };

export type SpokenCalendarReplyResult = {
  responseText: string;
  responseTone: SpokenUrgency | 'none';
  dayLoad: SpokenDayLoad;
  nextEvent: CalendarEvent | null;
  minutesUntilNextEvent: number | null;
};

/** @deprecated Use SpokenUrgency */
export type CalendarResponseTone = 'urgent' | 'prepare' | 'calm' | 'none';

/** @deprecated Use SpokenCalendarReplyResult */
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
];

const REMINDER_QUESTION_PATTERNS = [
  /\bremind(?: me)?\b/i,
  /\bнагад/i,
  /\bнапомни/i,
];

function formatSpokenTimeForVoice(isoValue: string) {
  const parsed = parseGoogleCalendarInstant(isoValue);

  if (parsed === null) {
    return '';
  }

  return new Date(parsed).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatSpokenPlaceHint(event: CalendarEvent, locale: VoiceLanguageChatLocale) {
  const location = event.location?.trim();
  const title = event.title.trim();

  if (location) {
    return location;
  }

  if (/library|бібліотек|библиотек/i.test(title)) {
    return locale === 'uk' ? 'бібліотеці' : locale === 'ru' ? 'библиотеке' : 'the library';
  }

  return '';
}

function buildSpokenEmptyDay(locale: VoiceLanguageChatLocale) {
  if (locale === 'uk') {
    return joinSpokenClauses(['На решту дня спокійно', 'можеш видихнути']);
  }

  if (locale === 'ru') {
    return joinSpokenClauses(['Дальше тихо', 'можно выдохнуть']);
  }

  return joinSpokenClauses(['Rest of today looks clear', 'no rush']);
}

function buildSpokenScheduleDraft(params: {
  visibleEvents: CalendarEvent[];
  locale: VoiceLanguageChatLocale;
  urgency: SpokenUrgency;
  dayLoad: SpokenDayLoad;
  minutesUntilNextEvent: number | null;
}) {
  const nextEvent = params.visibleEvents[0];
  const followingEvent = params.visibleEvents[1];
  const nextTime = formatSpokenTimeForVoice(nextEvent.startsAt);
  const nextPlace = formatSpokenPlaceHint(nextEvent, params.locale);
  const followingTime = followingEvent ? formatSpokenTimeForVoice(followingEvent.startsAt) : '';
  const followingPlace = followingEvent ? formatSpokenPlaceHint(followingEvent, params.locale) : '';
  const minutesLabel =
    params.minutesUntilNextEvent === null
      ? null
      : formatSpokenMinutesUntil(params.minutesUntilNextEvent, params.locale, 'soft');

  if (params.locale === 'uk') {
    if (params.urgency === 'immediate') {
      return joinSpokenClauses([
        'Друже, тобі вже пора збиратись',
        minutesLabel ? `до початку лишилось ${minutesLabel}` : 'скоро починається',
        nextTime && nextPlace ? `о ${nextTime} — ${nextPlace}` : nextTime ? `о ${nextTime}` : null,
      ]);
    }

    if (params.urgency === 'soon') {
      return joinSpokenClauses([
        'У тебе ще є трохи часу',
        nextTime
          ? followingTime
            ? `далі о ${nextTime}${nextPlace ? ` — ${nextPlace}` : ''}, потім о ${followingTime}`
            : `наступна о ${nextTime}${nextPlace ? ` — ${nextPlace}` : ''}`
          : null,
      ]);
    }

    if (params.dayLoad === 'light') {
      return joinSpokenClauses([
        'Сьогодні день не надто щільний',
        minutesLabel ? `до наступної ще ${minutesLabel}` : null,
        nextTime ? `потім о ${nextTime}` : null,
        followingTime && /бібліотек/i.test(followingPlace)
          ? 'після бібліотеки майже вільно'
          : null,
      ]);
    }

    return joinSpokenClauses([
      'Можеш трохи розслабитись',
      minutesLabel ? `до наступної ще ${minutesLabel}` : null,
      nextTime ? `потім о ${nextTime}` : null,
    ]);
  }

  if (params.locale === 'ru') {
    if (params.urgency === 'immediate') {
      return joinSpokenClauses([
        'Тебе уже пора выходить',
        minutesLabel ? `осталось ${minutesLabel}` : 'скоро начинается',
        nextTime ? `в ${nextTime}` : null,
      ]);
    }

    if (params.urgency === 'soon') {
      return joinSpokenClauses([
        'Ещё есть немного времени',
        nextTime
          ? `следующая в ${nextTime}${nextPlace ? ` — ${nextPlace}` : ''}`
          : null,
      ]);
    }

    return joinSpokenClauses([
      'Можно немного выдохнуть',
      minutesLabel ? `до следующей ещё ${minutesLabel}` : null,
      nextTime ? `потом в ${nextTime}` : null,
    ]);
  }

  if (params.urgency === 'immediate') {
    return joinSpokenClauses([
      'You should head out now',
      minutesLabel ? `starts in ${minutesLabel}` : 'starts very soon',
      nextTime ? `around ${nextTime}` : null,
    ]);
  }

  if (params.urgency === 'soon') {
    return joinSpokenClauses([
      'You still have some time',
      nextTime
        ? followingTime
          ? `next is around ${nextTime}, then ${followingTime}`
          : `next is around ${nextTime}`
        : null,
    ]);
  }

  if (params.dayLoad === 'light') {
    return joinSpokenClauses([
      'Looks like a lighter day today',
      minutesLabel ? `you've still got ${minutesLabel}` : 'no need to rush yet',
      followingTime ? "you're pretty free after that" : null,
    ]);
  }

  return joinSpokenClauses([
    'You can relax a bit',
    minutesLabel ? `still about ${minutesLabel} before the next one` : 'no need to rush yet',
    nextTime ? `then around ${nextTime}` : null,
  ]);
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

function logSpokenCalendarDiagnostics(result: SpokenCalendarReplyResult) {
  console.log(
    '[Voice Humanized] nextEvent',
    result.nextEvent
      ? {
          title: result.nextEvent.title,
          startsAt: result.nextEvent.startsAt,
          location: result.nextEvent.location ?? null,
        }
      : null,
  );
  console.log('[Voice Humanized] minutesUntilNextEvent', result.minutesUntilNextEvent);
  console.log('[Voice Humanized] responseTone', result.responseTone);
  console.log('[Voice Humanized] dayLoad', result.dayLoad);
  console.log('[Voice Humanized] responseText', result.responseText);
}

export function tryBuildSpokenCalendarReply(params: {
  transcript: string;
  visibleEvents: CalendarEvent[];
  languageCode: VoiceLanguageCode;
  referenceNow: Date;
}): SpokenCalendarReplyResult | null {
  if (!isCalendarScheduleQuestion(params.transcript)) {
    return null;
  }

  const locale = getChatLocaleFromVoiceLanguage(params.languageCode);
  const dayLoad = resolveSpokenDayLoad(params.visibleEvents.length);

  if (params.visibleEvents.length === 0) {
    const draft = buildSpokenEmptyDay(locale);
    const result: SpokenCalendarReplyResult = {
      responseText: formatVoiceResponse(draft, {
        urgency: 'free',
        locale,
        maxSentences: 2,
      }),
      responseTone: 'none',
      dayLoad,
      nextEvent: null,
      minutesUntilNextEvent: null,
    };

    logSpokenCalendarDiagnostics(result);
    return result;
  }

  const nextEvent = params.visibleEvents[0];
  const minutesUntilNextEvent = getMinutesUntilEvent(nextEvent.startsAt, params.referenceNow);
  const responseTone = resolveSpokenUrgency(minutesUntilNextEvent);
  const draft = buildSpokenScheduleDraft({
    visibleEvents: params.visibleEvents,
    locale,
    urgency: responseTone,
    dayLoad,
    minutesUntilNextEvent,
  });
  const responseText = formatVoiceResponse(draft, {
    urgency: responseTone,
    locale,
    maxSentences: 2,
  });

  const result: SpokenCalendarReplyResult = {
    responseText,
    responseTone,
    dayLoad,
    nextEvent,
    minutesUntilNextEvent,
  };

  logSpokenCalendarDiagnostics(result);
  return result;
}

export function tryBuildHumanizedCalendarReply(params: {
  transcript: string;
  visibleEvents: CalendarEvent[];
  languageCode: VoiceLanguageCode;
  referenceNow: Date;
}): HumanizedCalendarReplyResult | null {
  const spoken = tryBuildSpokenCalendarReply(params);

  if (!spoken) {
    return null;
  }

  const legacyTone: CalendarResponseTone =
    spoken.responseTone === 'immediate'
      ? 'urgent'
      : spoken.responseTone === 'soon'
        ? 'prepare'
        : spoken.responseTone === 'relaxed'
          ? 'calm'
          : 'none';

  return {
    responseText: spoken.responseText,
    responseTone: legacyTone,
    nextEvent: spoken.nextEvent,
    minutesUntilNextEvent: spoken.minutesUntilNextEvent,
  };
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
  const urgency = resolveSpokenUrgency(minutesUntilNextEvent);
  const locale = getChatLocaleFromVoiceLanguage(params.languageCode);

  const banned =
    'Voice-first reply: max 2 short spoken sentences, use natural pauses (...), never say "your next event", "upcoming event", or "calendar summary".';

  if (locale === 'uk') {
    if (urgency === 'immediate') {
      return `${banned} Ukrainian: warm, urgent, like a friend — e.g. "Тобі вже пора збиратись... за кілька хвилин починається."`;
    }

    if (urgency === 'soon') {
      return `${banned} Ukrainian: calm — e.g. "У тебе ще є трохи часу... наступна о 2:30."`;
    }

    return `${banned} Ukrainian: relaxed concierge tone. Mention only listed events.`;
  }

  if (locale === 'ru') {
    return `${banned} Russian: 1-2 short warm spoken sentences. Mention only listed events.`;
  }

  return `${banned} English: e.g. "You still have some time... next is around 2:30." No robotic calendar wording.`;
}
