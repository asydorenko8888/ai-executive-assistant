import type { CalendarEvent } from '@/src/entities/calendar/types';
import {
  formatDurationUntilFromEventStartIso,
  formatTotalMinutesAsDuration,
  type CalendarDurationLocale,
} from '@/src/features/agent/calendar/calendarDurationUntil';
import { formatTimeInExecutiveTimezone } from '@/src/features/agent/calendar/calendarTime';

/** FAKTY — час до початку події (завжди з ISO + now). */
export type EventTimeUntilFacts = {
  minutesUntilStart: number;
  formattedDuration: string;
  eventStartIso: string;
  eventStartLabel: string;
};

/** KONTEKST — лише те, що є в даних (не вигадувати). */
export type EventDepartureContext = {
  eventLocation: string | null;
  /** Road/travel minutes — only when route evidence exists. */
  travelMinutes: number | null;
  travelMinutesKnown: boolean;
  /** Preparation / get-ready minutes — only when explicitly configured. */
  prepMinutes: number | null;
};

/** PREFERENCES — звички та запас (поки немає профілю користувача). */
export type EventDeparturePreferences = {
  desiredBufferMinutes: number | null;
  habitNotes: string | null;
};

export type EventDepartureLayerAssessment = {
  facts: EventTimeUntilFacts;
  context: EventDepartureContext;
  preferences: EventDeparturePreferences | null;
  canRecommend: boolean;
  missingForRecommendation: string[];
};

const EXPLICIT_DEPARTURE_PLANNING_PATTERNS = [
  /\b(?:when should i leave|what time should i leave|leave by|time to leave)\b/i,
  /\b(?:коли\s+(?:мені\s+)?(?:виїжджати|виходити|йти)|о котрій\s+виїжджати)\b/iu,
  /\b(?:когда\s+(?:мне\s+)?(?:выезжать|выходить|идти)|во\s+сколько\s+выезжать)\b/iu,
];

export function isExplicitDeparturePlanningQuery(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized) {
    return false;
  }

  return EXPLICIT_DEPARTURE_PLANNING_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function buildEventTimeUntilFacts(params: {
  event: CalendarEvent;
  referenceNow: Date;
  locale: CalendarDurationLocale;
  timeZone?: string;
}): EventTimeUntilFacts | null {
  const duration = formatDurationUntilFromEventStartIso({
    eventStartIso: params.event.startsAt,
    referenceNow: params.referenceNow,
    locale: params.locale,
  });

  if (!duration) {
    return null;
  }

  return {
    minutesUntilStart: duration.diffMinutes,
    formattedDuration: duration.formattedDuration,
    eventStartIso: params.event.startsAt,
    eventStartLabel: formatTimeInExecutiveTimezone(
      params.event.startsAt,
      params.timeZone,
    ),
  };
}

/**
 * Travel evidence must come from a real estimate (e.g. place-to-place), not a generic default.
 */
export function buildEventDepartureContext(params: {
  event: CalendarEvent;
  travelEvidenceMinutes: number | null;
}): EventDepartureContext {
  const eventLocation = params.event.location?.trim() || null;
  const travelMinutesKnown =
    Boolean(eventLocation) &&
    params.travelEvidenceMinutes !== null &&
    params.travelEvidenceMinutes > 0;

  return {
    eventLocation,
    travelMinutes: travelMinutesKnown ? params.travelEvidenceMinutes : null,
    travelMinutesKnown,
    prepMinutes: null,
  };
}

export function buildEventDeparturePreferences(): EventDeparturePreferences | null {
  return null;
}

export function listMissingDepartureRecommendationFields(params: {
  facts: EventTimeUntilFacts;
  context: EventDepartureContext;
  preferences: EventDeparturePreferences | null;
}): string[] {
  const missing: string[] = [];

  if (params.facts.minutesUntilStart <= 0) {
    missing.push('future_event');
  }

  if (!params.context.eventLocation) {
    missing.push('event_location');
  }

  if (!params.context.travelMinutesKnown || params.context.travelMinutes === null) {
    missing.push('travel_time');
  }

  if (params.context.prepMinutes === null) {
    missing.push('prep_time');
  }

  if (params.preferences?.desiredBufferMinutes == null) {
    missing.push('desired_buffer');
  }

  return missing;
}

export function canGenerateDepartureRecommendation(params: {
  facts: EventTimeUntilFacts;
  context: EventDepartureContext;
  preferences: EventDeparturePreferences | null;
}): boolean {
  return listMissingDepartureRecommendationFields(params).length === 0;
}

export function assessEventDepartureLayers(params: {
  event: CalendarEvent;
  referenceNow: Date;
  locale: CalendarDurationLocale;
  timeZone?: string;
  travelEvidenceMinutes?: number | null;
  preferences?: EventDeparturePreferences | null;
}): EventDepartureLayerAssessment | null {
  const facts = buildEventTimeUntilFacts({
    event: params.event,
    referenceNow: params.referenceNow,
    locale: params.locale,
    timeZone: params.timeZone,
  });

  if (!facts) {
    return null;
  }

  const context = buildEventDepartureContext({
    event: params.event,
    travelEvidenceMinutes: params.travelEvidenceMinutes ?? null,
  });
  const preferences = params.preferences ?? buildEventDeparturePreferences();
  const missingForRecommendation = listMissingDepartureRecommendationFields({
    facts,
    context,
    preferences,
  });

  return {
    facts,
    context,
    preferences,
    canRecommend: missingForRecommendation.length === 0,
    missingForRecommendation,
  };
}

export function computeLeaveInMinutesFromLayers(params: {
  facts: EventTimeUntilFacts;
  context: EventDepartureContext;
  preferences: EventDeparturePreferences;
}): number {
  const travel = params.context.travelMinutes ?? 0;
  const prep = params.context.prepMinutes ?? 0;
  const buffer = params.preferences.desiredBufferMinutes ?? 0;

  return Math.max(0, params.facts.minutesUntilStart - travel - prep - buffer);
}

export function buildDepartureRecommendationText(params: {
  locale: CalendarDurationLocale;
  eventTitle: string;
  layers: EventDepartureLayerAssessment;
}): string | null {
  if (!params.layers.canRecommend || !params.layers.preferences) {
    return null;
  }

  const leaveInMinutes = computeLeaveInMinutesFromLayers({
    facts: params.layers.facts,
    context: params.layers.context,
    preferences: params.layers.preferences,
  });
  const leaveLabel = formatTotalMinutesAsDuration(leaveInMinutes, params.locale);

  if (params.locale === 'uk') {
    return `Рекомендація: виїжджай через ${leaveLabel} (дорога ~${params.layers.context.travelMinutes} хв, запас ${params.layers.preferences.desiredBufferMinutes} хв).`;
  }

  if (params.locale === 'ru') {
    return `Рекомендация: выезжай через ${leaveLabel} (дорога ~${params.layers.context.travelMinutes} мин, запас ${params.layers.preferences.desiredBufferMinutes} мин).`;
  }

  return `Recommendation: leave in ${leaveLabel} (travel ~${params.layers.context.travelMinutes} min, buffer ${params.layers.preferences.desiredBufferMinutes} min).`;
}

/** FAKTY-only reply for «скільки часу до …» — no travel or planning. */
export function buildFactsOnlyTimeUntilReply(params: {
  locale: CalendarDurationLocale;
  eventTitle: string;
  facts: EventTimeUntilFacts;
  isPast: boolean;
  isNow: boolean;
}): string {
  const { eventTitle, facts, locale } = params;

  if (params.isPast) {
    if (locale === 'uk') {
      return 'Подія вже почалася або завершилася.';
    }

    if (locale === 'ru') {
      return 'Событие уже началось или завершилось.';
    }

    return 'The event has already started or ended.';
  }

  if (params.isNow) {
    if (locale === 'uk') {
      return `«${eventTitle}» починається зараз.`;
    }

    if (locale === 'ru') {
      return `«${eventTitle}» начинается прямо сейчас.`;
    }

    return `"${eventTitle}" starts right now.`;
  }

  if (locale === 'uk') {
    return `До «${eventTitle}» залишилось ${facts.formattedDuration}.`;
  }

  if (locale === 'ru') {
    return `До «${eventTitle}» осталось ${facts.formattedDuration}.`;
  }

  return `There is ${facts.formattedDuration} until ${eventTitle}.`;
}

export function buildTimeUntilLayerPromptForLlm(locale: CalendarDurationLocale): string {
  if (locale === 'uk') {
    return (
      'Структура відповіді:\n' +
      'ФАКТИ: лише час до початку події.\n' +
      'КОНТЕКСТ (не вигадуй): місце події, час дороги, час на збір — лише якщо є в календарі або маршруті.\n' +
      'НАЛАШТУВАННЯ: звички користувача, бажаний запас — лише якщо відомі.\n' +
      'РЕКОМЕНДАЦІЇ: лише якщо заповнені всі необхідні поля; інакше не радь, коли виїжджати.'
    );
  }

  if (locale === 'ru') {
    return (
      'Структура ответа:\n' +
      'ФАКТЫ: только время до начала события.\n' +
      'КОНТЕКСТ (не выдумывай): место, время дороги, время на сборы — только если есть в данных.\n' +
      'НАСТРОЙКИ: привычки пользователя, желаемый запас — только если известны.\n' +
      'РЕКОМЕНДАЦИИ: только если заполнены все необходимые поля; иначе не советуй, когда выезжать.'
    );
  }

  return (
    'Response layers:\n' +
    'FACTS: time until event start only.\n' +
    'CONTEXT (do not invent): event location, travel time, prep time — only when present in calendar/route data.\n' +
    'PREFERENCES: user habits, desired buffer — only when known.\n' +
    'RECOMMENDATIONS: only when all required fields are present; otherwise do not suggest when to leave.'
  );
}

export function logEventDepartureLayers(params: {
  transcript: string;
  eventTitle: string;
  layers: EventDepartureLayerAssessment;
}) {
  console.log('[calendar_time_until_layers]', {
    transcript: params.transcript,
    eventTitle: params.eventTitle,
    facts: params.layers.facts,
    context: params.layers.context,
    preferences: params.layers.preferences,
    canRecommend: params.layers.canRecommend,
    missingForRecommendation: params.layers.missingForRecommendation,
  });
}
