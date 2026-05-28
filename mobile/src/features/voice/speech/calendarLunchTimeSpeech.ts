import {
  computeLunchTimeBudget,
  formatSpeechMinuteRange,
  wantsDetailedLunchTimeBreakdown,
} from '@/src/features/agent/calendar/calendarLunchTimeBudget';
import type { CalendarSituationAnalysis } from '@/src/features/agent/calendar/calendarSituationalReasoning';
import type { VoiceLanguageChatLocale } from '@/src/features/chat/services/voiceLanguage';
import { formatSpokenMinutesUntil } from '@/src/features/voice/speech/voiceSpeechFormatter';

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

function formatLeaveByHint(
  referenceNow: Date,
  leaveInMinutes: number,
  locale: VoiceLanguageChatLocale,
) {
  const leaveAt = new Date(referenceNow.getTime() + leaveInMinutes * 60_000);
  const timeLabel = leaveAt.toLocaleTimeString(
  locale === 'uk' ? 'uk-UA' : locale === 'ru' ? 'ru-RU' : 'en-US',
  {
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  },
);

  if (locale === 'uk') {
    return `виходи орієнтовно о ${timeLabel} (за ${leaveInMinutes} хвилин)`;
  }

  if (locale === 'ru') {
    return `выходи ориентировочно в ${timeLabel} (через ${leaveInMinutes} минут)`;
  }

  return `head out around ${timeLabel} (in about ${leaveInMinutes} minutes)`;
}

function buildRiskRecommendation(
  budget: NonNullable<ReturnType<typeof computeLunchTimeBudget>>,
  locale: VoiceLanguageChatLocale,
) {
  if (locale === 'uk') {
    switch (budget.riskLevel) {
      case 'safe':
        return 'часу достатньо — не розтягуй обід без потреби';
      case 'moderate':
        return 'краще швидко';
      case 'tight':
        return 'лише короткий обід, інакше буде важко';
      default:
        return 'краще легкий перекус — повноцінний обід уже ризиковано';
    }
  }

  if (locale === 'ru') {
    switch (budget.riskLevel) {
      case 'safe':
        return 'времени хватает — не затягивай обед';
      case 'moderate':
        return 'лучше быстро';
      case 'tight':
        return 'только короткий обед';
      default:
        return 'лучше перекус — полноценный обед уже рискованно';
    }
  }

  switch (budget.riskLevel) {
    case 'safe':
      return 'you have enough room — do not stretch lunch';
    case 'moderate':
      return 'keep it brisk';
    case 'tight':
      return 'only a short lunch window';
    default:
      return 'stick to a quick bite — a long sit-down lunch is risky';
  }
}

export function buildDetailedLunchTimeSpeech(
  analysis: CalendarSituationAnalysis,
  locale: VoiceLanguageChatLocale,
  referenceNow: Date,
): string | null {
  if (!wantsDetailedLunchTimeBreakdown(analysis)) {
    return null;
  }

  const budget = computeLunchTimeBudget(analysis);

  if (!budget) {
    return null;
  }

  const destination = shortPlace(analysis.destinationEvent?.location);
  const meetingLabel = formatSpokenMinutesUntil(budget.minutesUntilMeeting, locale, 'precise');
  const travelReserve = formatSpeechMinuteRange(
    budget.travelKnown ? budget.travelMinutesMin : budget.travelMinutesMin,
    budget.travelKnown
      ? budget.travelMinutesMax + budget.bufferMinutes
      : budget.travelMinutesMax,
    locale,
  );
  const lunchWindow = formatSpeechMinuteRange(budget.lunchMinutesMin, budget.lunchMinutesMax, locale);
  const leaveHint = formatLeaveByHint(referenceNow, budget.leaveInMinutes, locale);
  const recommendation = buildRiskRecommendation(budget, locale);

  if (locale === 'uk') {
    const meetingRef = 'зустрічі';
    const travelClause = budget.travelKnown
      ? `залиш собі хоча б ${travelReserve} на дорогу і буфер`
      : `дорогу точно не знаю — заклади консервативний запас ${travelReserve} на дорогу і буфер`;
    const lunchClause =
      budget.lunchMinutesMax <= 0
        ? 'на повноцінний обід часу практично немає'
        : `на сам обід маєш приблизно ${lunchWindow}`;

    return [
      `До ${meetingRef} ${meetingLabel}.`,
      budget.lunchMinutesMax > 0
        ? `Так, пообідати встигаєш — ${recommendation}: ${travelClause}.`
        : `Пообідати вже щільно: ${travelClause}.`,
      `${lunchClause.charAt(0).toUpperCase()}${lunchClause.slice(1)}.`,
      leaveHint.charAt(0).toUpperCase() + leaveHint.slice(1) + '.',
    ].join(' ');
  }

  if (locale === 'ru') {
    const meetingRef = destination ? `встреча в ${destination}` : 'встреча';
    const travelClause = budget.travelKnown
      ? `заложи минимум ${travelReserve} на дорогу и буфер`
      : `дорогу точно не знаю — заложи запас ${travelReserve} на дорогу и буфер`;
    const lunchClause =
      budget.lunchMinutesMax <= 0
        ? 'на полноценный обед времени почти нет'
        : `на сам обед останется примерно ${lunchWindow}`;

    return [
      `До ${meetingRef} ${meetingLabel}.`,
      budget.lunchMinutesMax > 0
        ? `Да, пообедать успеешь, но ${recommendation}: ${travelClause}.`
        : `Пообедать уже туго: ${travelClause}.`,
      `${lunchClause.charAt(0).toUpperCase()}${lunchClause.slice(1)}.`,
      leaveHint.charAt(0).toUpperCase() + leaveHint.slice(1) + '.',
    ].join(' ');
  }

  const meetingRef = destination ? `the meeting in ${destination}` : 'the meeting';
  const travelClause = budget.travelKnown
    ? `reserve at least ${travelReserve} for the drive and buffer`
    : `I do not know the exact drive time — use a conservative ${travelReserve} for travel and buffer`;
  const lunchClause =
    budget.lunchMinutesMax <= 0
      ? 'there is practically no time for a real lunch'
      : `that leaves about ${lunchWindow} to actually eat`;

  return [
    `${meetingLabel} until ${meetingRef}.`,
    budget.lunchMinutesMax > 0
      ? `Yes, you can do lunch, but ${recommendation}: ${travelClause}.`
      : `Lunch is tight: ${travelClause}.`,
    `${lunchClause.charAt(0).toUpperCase()}${lunchClause.slice(1)}.`,
    leaveHint.charAt(0).toUpperCase() + leaveHint.slice(1) + '.',
  ].join(' ');
}
