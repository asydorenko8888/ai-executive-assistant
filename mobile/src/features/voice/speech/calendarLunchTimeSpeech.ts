import {
  computeLunchTimeBudget,
  formatSpeechMinuteRange,
  type LunchTimeBudget,
  wantsDetailedLunchTimeBreakdown,
} from '@/src/features/agent/calendar/calendarLunchTimeBudget';
import type { CalendarSituationAnalysis } from '@/src/features/agent/calendar/calendarSituationalReasoning';
import type { VoiceLanguageChatLocale } from '@/src/features/chat/services/voiceLanguage';
import { formatSpokenMinutesUntil } from '@/src/features/voice/speech/voiceSpeechFormatter';

type CompanionSpeechParts = {
  opener?: string;
  assessment: string;
  recommendation: string;
  warning?: string;
};

function shortPlace(location?: string | null) {
  if (!location?.trim()) {
    return '';
  }

  const value = location.trim();

  if (/arlington/i.test(value)) {
    return 'Arlington';
  }

  if (/elk grove/i.test(value)) {
    return 'Elk Grove Village';
  }

  return value.split(',')[0]?.trim() ?? value;
}

function formatLeaveWithinPhrase(leaveInMinutes: number, locale: VoiceLanguageChatLocale) {
  const minutes = Math.max(5, Math.round(leaveInMinutes / 5) * 5);

  if (locale === 'uk') {
    if (minutes <= 25) {
      return 'через 20–25 хвилин';
    }

    if (minutes <= 40) {
      return 'максимум через півгодини';
    }

    return `орієнтовно через ${minutes} хвилин`;
  }

  if (locale === 'ru') {
    if (minutes <= 25) {
      return 'через 20–25 минут';
    }

    if (minutes <= 40) {
      return 'максимум через полчаса';
    }

    return `примерно через ${minutes} минут`;
  }

  if (minutes <= 25) {
    return 'within about 20–25 minutes';
  }

  if (minutes <= 40) {
    return 'within the next half hour';
  }

  return `in about ${minutes} minutes`;
}

function ensureSentence(value: string) {
  const trimmed = value.trim();
  const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);

  if (/[.!?…]$/.test(capitalized)) {
    return capitalized;
  }

  return `${capitalized}.`;
}

function joinCompanionParts(parts: CompanionSpeechParts, maxSentences = 4) {
  return [parts.opener, parts.assessment, parts.recommendation, parts.warning]
    .map((sentence) => (sentence ? ensureSentence(sentence) : null))
    .filter(Boolean)
    .slice(0, maxSentences)
    .join(' ');
}

function buildTravelWarning(
  budget: LunchTimeBudget,
  destination: string,
  locale: VoiceLanguageChatLocale,
) {
  const travelReserve = formatSpeechMinuteRange(
    budget.travelKnown ? budget.travelMinutesMin : budget.travelMinutesMin,
    budget.travelKnown
      ? budget.travelMinutesMax + budget.bufferMinutes
      : budget.travelMinutesMax,
    locale,
  );

  if (locale === 'uk') {
    if (destination && budget.travelKnown) {
      return `заклади ${travelReserve} на дорогу в ${destination} — виходи ${formatLeaveWithinPhrase(budget.leaveInMinutes, locale)}`;
    }

    if (destination) {
      return `дорогу в ${destination} не знаю точно — візьми запас ${travelReserve} і виходи ${formatLeaveWithinPhrase(budget.leaveInMinutes, locale)}`;
    }

    return budget.travelKnown
      ? `на дорогу й буфер залиш ${travelReserve}, виходи ${formatLeaveWithinPhrase(budget.leaveInMinutes, locale)}`
      : `дорогу не знаю — заклади запас ${travelReserve} і не сиди довго за столом`;
  }

  if (locale === 'ru') {
    if (destination && budget.travelKnown) {
      return `заложи ${travelReserve} на дорогу в ${destination} — выезжай ${formatLeaveWithinPhrase(budget.leaveInMinutes, locale)}`;
    }

    if (destination) {
      return `дорогу в ${destination} точно не знаю — возьми запас ${travelReserve} и выезжай ${formatLeaveWithinPhrase(budget.leaveInMinutes, locale)}`;
    }

    return budget.travelKnown
      ? `на дорогу и буфер оставь ${travelReserve}, выезжай ${formatLeaveWithinPhrase(budget.leaveInMinutes, locale)}`
      : `дорогу не знаю — заложи запас ${travelReserve} и не затягивай за столом`;
  }

  if (destination && budget.travelKnown) {
    return `save ${travelReserve} for the drive to ${destination} and head out ${formatLeaveWithinPhrase(budget.leaveInMinutes, locale)}`;
  }

  if (destination) {
    return `I do not know the exact drive to ${destination} — budget ${travelReserve} and leave ${formatLeaveWithinPhrase(budget.leaveInMinutes, locale)}`;
  }

  return budget.travelKnown
    ? `keep ${travelReserve} for travel and buffer, and leave ${formatLeaveWithinPhrase(budget.leaveInMinutes, locale)}`
    : `drive time is unclear — use a ${travelReserve} cushion and do not linger`;
}

function buildCompanionParts(
  budget: LunchTimeBudget,
  destination: string,
  locale: VoiceLanguageChatLocale,
): CompanionSpeechParts {
  const meetingMinutes = formatSpokenMinutesUntil(budget.minutesUntilMeeting, locale, 'precise');
  const lunchWindow = formatSpeechMinuteRange(budget.lunchMinutesMin, budget.lunchMinutesMax, locale);
  const destPhrase = destination ? ` в ${destination}` : '';

  if (locale === 'uk') {
    switch (budget.riskLevel) {
      case 'safe':
        return {
          assessment: `Зараз у тебе нормальний запас — до зустрічі ще ${meetingMinutes}`,
          recommendation: 'Можеш спокійно пообідати, без паніки',
          warning: destination
            ? `але не розпускайся надто довго — ${buildTravelWarning(budget, destination, locale)}`
            : undefined,
        };
      case 'moderate':
        return destination
          ? {
              opener: 'Чесно?',
              assessment: `Я б не затягував. На їжу орієнтовно ${lunchWindow}, а тобі ще їхати в ${destination}`,
              recommendation: 'Візьми щось поруч — швидкий ланч, не довгий обід',
              warning: `Виходи ${formatLeaveWithinPhrase(budget.leaveInMinutes, locale)}`,
            }
          : {
              opener: 'Чесно?',
              assessment: `Поїсти встигаєш — це швидкий ланч. До зустрічі ${meetingMinutes}`,
              recommendation: 'Візьми щось поруч',
              warning: buildTravelWarning(budget, destination, locale),
            };
      case 'tight':
        return {
          opener: 'Якщо швидко — встигнеш',
          assessment: `Але зараз уже не час для довгого обіду — на їжу лишається ${lunchWindow}`,
          recommendation: 'Краще щось легке поруч',
          warning: buildTravelWarning(budget, destination, locale),
        };
      default:
        return {
          opener: 'Чесно — вже щільно',
          assessment: `Повноцінний обід${destPhrase} уже ризикований`,
          recommendation: destination
            ? `Краще легкий перекус і рухайся в бік ${destination}`
            : 'Краще перекус і збирайся',
          warning: buildTravelWarning(budget, destination, locale),
        };
    }
  }

  if (locale === 'ru') {
    switch (budget.riskLevel) {
      case 'safe':
        return {
          assessment: `Сейчас запас нормальный — до встречи ещё ${meetingMinutes}`,
          recommendation: 'Можешь спокойно поесть, без суеты',
          warning: destination
            ? `но не расслабляйся слишком долго — ${buildTravelWarning(budget, destination, locale)}`
            : undefined,
        };
      case 'moderate':
        return destination
          ? {
              opener: 'Честно?',
              assessment: `Я бы не затягивал. Времени немного, а тебе ещё ехать в ${destination}`,
              recommendation: 'Возьми что-то рядом — быстрый ланч, не длинный обед',
              warning: `Выезжай ${formatLeaveWithinPhrase(budget.leaveInMinutes, locale)}`,
            }
          : {
              opener: 'Честно?',
              assessment: `Поесть успеешь — это быстрый ланч. До встречи ${meetingMinutes}`,
              recommendation: 'Возьми что-то рядом',
              warning: buildTravelWarning(budget, destination, locale),
            };
      case 'tight':
        return {
          opener: 'Если быстро — успеваешь',
          assessment: `Но сейчас уже не время для длинного обеда — на стол остаётся ${lunchWindow}`,
          recommendation: 'Возьми что-то рядом',
          warning: buildTravelWarning(budget, destination, locale),
        };
      default:
        return {
          opener: 'Честно — уже туго',
          assessment: `Нормальный обед${destPhrase} уже рискованный`,
          recommendation: destination
            ? `Лучше перекус и двигайся к ${destination}`
            : 'Лучше перекус и собирайся',
          warning: buildTravelWarning(budget, destination, locale),
        };
    }
  }

  switch (budget.riskLevel) {
    case 'safe':
      return {
        assessment: `You're in decent shape — about ${meetingMinutes} before the meeting`,
        recommendation: 'Go ahead and eat without rushing',
        warning: destination
          ? `just do not lose track of time — ${buildTravelWarning(budget, destination, locale)}`
          : undefined,
      };
    case 'moderate':
      return destination
        ? {
            opener: 'Honestly?',
            assessment: `I would not stretch it. You have about ${lunchWindow} to eat, and you still need to get to ${destination}`,
            recommendation: 'Grab something nearby — quick lunch, not a long sit-down',
            warning: `Head out ${formatLeaveWithinPhrase(budget.leaveInMinutes, locale)}`,
          }
        : {
            opener: 'Honestly?',
            assessment: `You can eat — think quick lunch. ${meetingMinutes} until the meeting`,
            recommendation: 'Keep it nearby and do not linger',
            warning: buildTravelWarning(budget, destination, locale),
          };
    case 'tight':
      return {
        opener: 'If you move fast, you can make it',
        assessment: `This is not a long lunch moment — you've got about ${lunchWindow} to eat`,
        recommendation: 'Keep it light and nearby',
        warning: buildTravelWarning(budget, destination, locale),
      };
    default:
      return {
        opener: 'Honestly — you are tight',
        assessment: `A full lunch${destPhrase ? ` before ${destination}` : ''} is risky now`,
        recommendation: destination
          ? `I'd grab a quick bite and start heading toward ${destination}`
          : 'I would snack now and get moving',
        warning: buildTravelWarning(budget, destination, locale),
      };
  }
}

export function buildCompanionLunchTimeSpeech(
  analysis: CalendarSituationAnalysis,
  locale: VoiceLanguageChatLocale,
  maxSentences = 4,
): string | null {
  const budget = computeLunchTimeBudget(analysis);

  if (!budget) {
    return null;
  }

  const destination = shortPlace(analysis.destinationEvent?.location);
  const parts = buildCompanionParts(budget, destination, locale);

  return joinCompanionParts(parts, maxSentences);
}

/** Full judgment for explicit "how much time / can I lunch" questions. */
export function buildDetailedLunchTimeSpeech(
  analysis: CalendarSituationAnalysis,
  locale: VoiceLanguageChatLocale,
  _referenceNow: Date,
): string | null {
  if (!wantsDetailedLunchTimeBreakdown(analysis)) {
    return null;
  }

  return buildCompanionLunchTimeSpeech(analysis, locale, 4);
}

/** Shorter companion take for situational intercept (2–3 sentences). */
export function buildCompanionLunchBrief(
  analysis: CalendarSituationAnalysis,
  locale: VoiceLanguageChatLocale,
): string | null {
  if (!analysis.modifiers.mentionsLunch && analysis.category !== 'travel_awareness') {
    return null;
  }

  return buildCompanionLunchTimeSpeech(analysis, locale, 3);
}
