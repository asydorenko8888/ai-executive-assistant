import type { CalendarEvent } from '@/src/entities/calendar/types';
import { analyzeCalendarSituation } from '@/src/features/agent/calendar/calendarSituationalReasoning';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { getChatLocaleFromVoiceLanguage } from '@/src/features/chat/services/voiceLanguage';
import type { VoiceSessionContext } from '@/src/features/voice/memory/voiceSessionMemory';
import { buildDetailedLunchTimeSpeech } from '@/src/features/voice/speech/calendarLunchTimeSpeech';
import { enrichTranscriptWithSessionContext } from '@/src/features/voice/memory/voiceSessionMemory';

function isTrafficFollowUp(transcript: string) {
  return /\b(traffic|jam|worse|heavier|пробк|затор|гірш)\b/i.test(transcript);
}

function isStillMakeItFollowUp(transcript: string) {
  return /\b(still (?:in|make it|have time)|do i still|встигну|чи встигаю|still in)\b/i.test(transcript);
}

function isShortFollowUp(transcript: string) {
  const words = transcript.trim().split(/\s+/).length;

  return words <= 14;
}

function hasActiveTimingSession(session: VoiceSessionContext) {
  const { state } = session;

  return (
    state.consideringLunch ||
    state.timingConcern ||
    state.gymClosed ||
    Boolean(state.userLocation) ||
    state.facts.some((fact) => /lunch|timing|arlington|elk grove|gym/i.test(fact))
  );
}

export function tryBuildGymLunchPivotReply(params: {
  transcript: string;
  session: VoiceSessionContext;
  languageCode: VoiceLanguageCode;
}): string | null {
  if (
    !params.session.state.gymClosed ||
    !params.session.state.consideringLunch ||
    !/\b(lunch|обід|eat|thinking about)\b/i.test(params.transcript) ||
    /\b(how much time|exactly|скільки часу|how long)\b/i.test(params.transcript)
  ) {
    return null;
  }

  const locale = getChatLocaleFromVoiceLanguage(params.languageCode);

  if (locale === 'uk') {
    return 'Тоді це, мабуть, найкраще вікно поїсти — поки ще є час перед Arlington.';
  }

  if (locale === 'ru') {
    return 'Тогда это, наверное, лучшее окно поесть — пока ещё есть время до Arlington.';
  }

  return 'Then this is probably your best window to eat — before you need to head toward Arlington.';
}

export function tryBuildVoiceSessionFollowUpReply(params: {
  transcript: string;
  session: VoiceSessionContext;
  visibleEvents: CalendarEvent[];
  languageCode: VoiceLanguageCode;
  referenceNow: Date;
}): string | null {
  if (!hasActiveTimingSession(params.session) || !isShortFollowUp(params.transcript)) {
    return null;
  }

  const locale = getChatLocaleFromVoiceLanguage(params.languageCode);
  const enrichedTranscript = enrichTranscriptWithSessionContext(
    params.transcript,
    params.session,
  );

  if (isTrafficFollowUp(params.transcript)) {
    if (locale === 'uk') {
      return 'Тоді я б не чекав. Виходи максимум за 15–20 хвилин — на пробки краще не розраховувати.';
    }

    if (locale === 'ru') {
      return 'Тогда я бы не ждал. Выезжай максимум через 15–20 минут — на пробки лучше не рассчитывать.';
    }

    return "Then I would not wait on it. Leave within 15–20 minutes max — do not bet on traffic easing.";
  }

  if (isStillMakeItFollowUp(params.transcript)) {
    const situation = analyzeCalendarSituation({
      transcript: enrichedTranscript,
      visibleEvents: params.visibleEvents,
      referenceNow: params.referenceNow,
    });
    const detailed = buildDetailedLunchTimeSpeech(situation, locale, params.referenceNow);

    if (detailed) {
      return detailed;
    }

    const destination = params.session.state.userLocation;

    if (locale === 'uk') {
      return destination
        ? `Ледве, якщо швидко. Довгий обід у ${destination} я б уже не брав — краще щось поруч і рухайся.`
        : 'Ледве, якщо швидко. Довгий обід я б уже не брав.';
    }

    if (locale === 'ru') {
      return destination
        ? `Едва, если быстро. Длинный обед в ${destination} я бы уже не брал — возьми что-то рядом и выезжай.`
        : 'Едва, если быстро. Длинный обед я бы уже не брал.';
    }

    return destination
      ? `Barely, if you keep it quick. I would not do a long sit-down lunch in ${destination} now.`
      : 'Barely, if you keep it quick. I would not do a long sit-down lunch now.';
  }

  return null;
}
