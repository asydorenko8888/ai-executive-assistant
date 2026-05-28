import type { CalendarSituationAnalysis } from '@/src/features/agent/calendar/calendarSituationalReasoning';
import type { VoiceLanguageChatLocale } from '@/src/features/chat/services/voiceLanguage';
import { buildCompanionLunchBrief } from '@/src/features/voice/speech/calendarLunchTimeSpeech';
import { joinSpokenClauses } from '@/src/features/voice/speech/voiceSpeechFormatter';

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

function lunchWindowTone(analysis: CalendarSituationAnalysis) {
  const free = analysis.modifiers.effectiveFreeMinutes;

  if (free === null) {
    return 'unknown';
  }

  if (free >= 50) {
    return 'comfortable';
  }

  if (free >= 25) {
    return 'moderate';
  }

  return 'tight';
}

export function buildSituationalSpeechDraft(
  analysis: CalendarSituationAnalysis,
  locale: VoiceLanguageChatLocale,
): string | null {
  const destination = shortPlace(analysis.destinationEvent?.location);
  const lunchPlace =
    analysis.modifiers.userPlaceMentions.find((place) => place !== destination) ??
    analysis.modifiers.userPlaceMentions[0] ??
    '';
  const windowTone = lunchWindowTone(analysis);

  if (locale === 'uk') {
    switch (analysis.category) {
      case 'plan_change':
        return joinSpokenClauses([
          'Так, з обідом маєш встигнути',
          analysis.modifiers.mentionsGym ? 'що зал закритий — не кінець світу' : null,
          destination ? `головне — не затягни перед ${destination}` : 'головне — не затягни надто довго',
        ]);
      case 'travel_awareness':
      case 'lunch_free_time': {
        const companion = buildCompanionLunchBrief(analysis, locale);

        if (companion) {
          return companion;
        }

        if (windowTone === 'comfortable') {
          return joinSpokenClauses([
            'Можеш пообідати спокійно',
            destination ? `головне — не забудь про дорогу в ${destination}` : 'головне — не втрачай ритм',
          ]);
        }

        return joinSpokenClauses([
          'Чесно?',
          destination
            ? `Поїсти встигаєш, але я б не затягував — ${destination} ще попереду`
            : 'Поїсти встигаєш, але тільки швидко',
        ]);
      }
      case 'late_risk':
        return joinSpokenClauses([
          'Чесно, часу мало',
          destination ? `краще вже рухатись у бік ${destination}` : 'краще вже збиратись',
        ]);
      case 'reassurance':
        return joinSpokenClauses([
          analysis.modifiers.mentionsGym && analysis.modifiers.planChange
            ? 'Так, з обідом маєш встигнути — що зал закритий, не страшно'
            : 'Маєш встигнути',
          destination ? `якщо не затягнеш перед ${destination}` : 'якщо не будеш тягнути',
        ]);
      case 'compressed_schedule':
        return joinSpokenClauses([
          'День щільний',
          'на обід час короткий — далі краще без зайвих пауз',
        ]);
      case 'relaxed_schedule':
        return joinSpokenClauses([
          'Тут без паніки',
          'на обід і паузу часу достатньо',
        ]);
      default:
        return null;
    }
  }

  if (locale === 'ru') {
    switch (analysis.category) {
      case 'plan_change':
        return joinSpokenClauses([
          'С обедом должно получиться',
          destination ? `главное — не затягивать перед ${destination}` : 'главное — не затягивать',
        ]);
      case 'travel_awareness':
      case 'lunch_free_time': {
        const companion = buildCompanionLunchBrief(analysis, locale);

        return (
          companion ??
          joinSpokenClauses([
            'Если быстро — успеваешь',
            destination
              ? `но это не длинный обед — ${destination} ещё впереди`
              : 'но лучше не затягивать',
          ])
        );
      }
      case 'late_risk':
        return joinSpokenClauses([
          'Времени мало',
          destination ? `лучше уже выдвигаться к ${destination}` : 'лучше уже собираться',
        ]);
      case 'reassurance':
        return joinSpokenClauses([
          'Должно хватить',
          destination ? `если не затянешь перед ${destination}` : 'если не будешь тянуть',
        ]);
      default:
        return null;
    }
  }

  switch (analysis.category) {
    case 'plan_change':
      return joinSpokenClauses([
        analysis.modifiers.mentionsGym
          ? 'Yeah, lunch still works — gym being closed is annoying, but you can pivot'
          : 'Yeah, lunch should still work',
        destination
          ? `just do not stretch it too long before ${destination}`
          : 'just keep it moving',
      ]);
    case 'travel_awareness':
    case 'lunch_free_time': {
      const companion = buildCompanionLunchBrief(analysis, locale);

      if (companion) {
        return companion;
      }

      return joinSpokenClauses([
        'Honestly?',
        destination
          ? `You can eat — quick lunch, not a long one. I would not stretch it with ${destination} still ahead`
          : 'You can eat, but keep it brisk',
      ]);
    }
    case 'late_risk':
      return joinSpokenClauses([
        'Honestly, you are tight on time',
        destination ? `I would start heading toward ${destination} soon` : 'I would get moving soon',
      ]);
    case 'reassurance':
      return joinSpokenClauses([
        'You should still be okay',
        destination ? `just do not let lunch run long before ${destination}` : 'just keep an eye on the clock',
      ]);
    case 'compressed_schedule':
      return joinSpokenClauses([
        'It is a packed stretch',
        'lunch needs to be quick, then stay on rhythm',
      ]);
    case 'relaxed_schedule':
      return joinSpokenClauses([
        'You are in decent shape time-wise',
        'no need to rush lunch',
      ]);
    default:
      return null;
  }
}
