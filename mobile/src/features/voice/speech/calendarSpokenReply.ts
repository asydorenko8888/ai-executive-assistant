import type { CalendarEvent } from '@/src/entities/calendar/types';
import {
  analyzeCalendarSituation,
  buildSituationContextForLlm,
  isCalendarAwareQuestion,
} from '@/src/features/agent/calendar/calendarSituationalReasoning';
import { shouldSuppressConversationalCalendarRouting } from '@/src/features/agent/intent/assistantIntentRouter';
import { getMinutesUntilEvent, parseGoogleCalendarInstant } from '@/src/features/agent/calendar/calendarTime';
import type { VoiceLanguageChatLocale, VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { getChatLocaleFromVoiceLanguage } from '@/src/features/chat/services/voiceLanguage';
import type { VoiceSessionContext } from '@/src/features/voice/memory/voiceSessionMemory';
import { enrichTranscriptWithSessionContext } from '@/src/features/voice/memory/voiceSessionMemory';
import { buildDetailedLunchTimeSpeech } from '@/src/features/voice/speech/calendarLunchTimeSpeech';
import { buildSituationalSpeechDraft } from '@/src/features/voice/speech/calendarSituationalSpeech';
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

export { isCalendarAwareQuestion, isCalendarScheduleQuestion } from '@/src/features/agent/calendar/calendarSituationalReasoning';

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

function logSpokenCalendarDiagnostics(
  result: SpokenCalendarReplyResult,
  situationCategory?: string,
) {
  if (situationCategory) {
    console.log('[Calendar Situation] responseCategory', situationCategory);
  }
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
  sessionContext?: VoiceSessionContext | null;
}): SpokenCalendarReplyResult | null {
  const contextualTranscript = enrichTranscriptWithSessionContext(
    params.transcript,
    params.sessionContext,
  );

  if (
    shouldSuppressConversationalCalendarRouting(params.transcript) ||
    shouldSuppressConversationalCalendarRouting(contextualTranscript)
  ) {
    return null;
  }

  if (!isCalendarAwareQuestion(contextualTranscript) && !isCalendarAwareQuestion(params.transcript)) {
    return null;
  }

  const locale = getChatLocaleFromVoiceLanguage(params.languageCode);
  const situation = analyzeCalendarSituation({
    transcript: contextualTranscript,
    visibleEvents: params.visibleEvents,
    referenceNow: params.referenceNow,
  });
  const dayLoad = situation.dayLoad;

  if (params.visibleEvents.length === 0) {
    const situationalDraft = buildSituationalSpeechDraft(situation, locale);
    const draft = situationalDraft ?? buildSpokenEmptyDay(locale);
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

    logSpokenCalendarDiagnostics(result, situation.category);
    return result;
  }

  const nextEvent = situation.nextEvent ?? params.visibleEvents[0];
  const minutesUntilNextEvent = situation.minutesUntilNextEvent;
  const responseTone = situation.urgency;
  const detailedDraft = buildDetailedLunchTimeSpeech(situation, locale, params.referenceNow);
  const situationalDraft =
    detailedDraft ??
    (situation.category !== 'simple_schedule'
      ? buildSituationalSpeechDraft(situation, locale)
      : null);
  const draft =
    situationalDraft ??
    buildSpokenScheduleDraft({
      visibleEvents: params.visibleEvents,
      locale,
      urgency: responseTone,
      dayLoad,
      minutesUntilNextEvent,
    });
  const responseText = formatVoiceResponse(draft, {
    urgency: responseTone,
    locale,
    maxSentences: detailedDraft ? 4 : 2,
    preserveSentences: Boolean(detailedDraft),
  });

  const result: SpokenCalendarReplyResult = {
    responseText,
    responseTone,
    dayLoad,
    nextEvent,
    minutesUntilNextEvent,
  };

  logSpokenCalendarDiagnostics(result, situation.category);
  return result;
}

export function tryBuildHumanizedCalendarReply(params: {
  transcript: string;
  visibleEvents: CalendarEvent[];
  languageCode: VoiceLanguageCode;
  referenceNow: Date;
  sessionContext?: VoiceSessionContext | null;
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
  transcript?: string;
  sessionContext?: VoiceSessionContext | null;
}): string {
  if (params.visibleEvents.length === 0) {
    return '';
  }

  const locale = getChatLocaleFromVoiceLanguage(params.languageCode);
  const situation = analyzeCalendarSituation({
    transcript: enrichTranscriptWithSessionContext(
      params.transcript ?? 'What is on my schedule?',
      params.sessionContext,
    ),
    visibleEvents: params.visibleEvents,
    referenceNow: params.referenceNow,
  });

  const banned =
    'Companion voice: calm, slightly caring, practical. Structure — optional human opener, situation assessment, clear recommendation, travel/leave warning. No calendar dumps, no passive time-only answers. Never claim you already called, texted, or reached someone. No robotic refusals — if outreach is not wired yet, one soft line ("message is ready", "still need the contact") then the useful answer.';

  return `${banned} ${buildSituationContextForLlm(situation)} Respond in ${locale === 'uk' ? 'Ukrainian' : locale === 'ru' ? 'Russian' : 'English'}.`;
}
