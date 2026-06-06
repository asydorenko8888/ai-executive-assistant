import type { CalendarEvent } from '@/src/entities/calendar/types';
import {
  formatDurationUntilFromEventStartIso,
  logCalendarTimeUntilDebug,
  type CalendarDurationLocale,
} from '@/src/features/agent/calendar/calendarDurationUntil';
import {
  assessEventDepartureLayers,
  buildDepartureRecommendationText,
  buildFactsOnlyTimeUntilReply,
  isExplicitDeparturePlanningQuery,
  logEventDepartureLayers,
} from '@/src/features/agent/calendar/calendarTimeUntilLayers';
import {
  extractTimeUntilEventTitleQuery,
  findAllTitleMatchingTimeUntilEvents,
  findFutureMatchingTimeUntilEvents,
  getTimeUntilNoFutureMatchMessage,
  isCalendarTimeUntilEventQuery,
  logTimeUntilEventSelection,
} from '@/src/features/agent/calendar/calendarTimeUntilQuery';
import { getExecutiveCalendarTimezone } from '@/src/features/agent/calendar/calendarTimezone';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { getChatLocaleFromVoiceLanguage } from '@/src/features/chat/services/voiceLanguage';

export function tryBuildCalendarTimeUntilReplyFromEvents(params: {
  transcript: string;
  languageCode: VoiceLanguageCode;
  referenceNow: Date;
  events: CalendarEvent[];
  /** Real route estimate (minutes), not a default guess. */
  travelEvidenceMinutes?: number | null;
}): string | null {
  if (!isCalendarTimeUntilEventQuery(params.transcript)) {
    return null;
  }

  const locale = getChatLocaleFromVoiceLanguage(params.languageCode) as CalendarDurationLocale;
  const titleQuery = extractTimeUntilEventTitleQuery(params.transcript);

  if (!titleQuery) {
    return null;
  }

  const allMatching = findAllTitleMatchingTimeUntilEvents({
    titleQuery,
    events: params.events,
  });
  const futureMatching = findFutureMatchingTimeUntilEvents({
    titleQuery,
    events: params.events,
    referenceNow: params.referenceNow,
  });

  if (futureMatching.length === 0) {
    if (allMatching.length > 0) {
      return getTimeUntilNoFutureMatchMessage(locale);
    }

    return null;
  }

  const targetEvent = futureMatching[0] ?? null;

  if (!targetEvent) {
    return null;
  }

  const duration = formatDurationUntilFromEventStartIso({
    eventStartIso: targetEvent.startsAt,
    referenceNow: params.referenceNow,
    locale,
  });

  if (!duration) {
    return null;
  }

  const layers = assessEventDepartureLayers({
    event: targetEvent,
    referenceNow: params.referenceNow,
    locale,
    timeZone: getExecutiveCalendarTimezone(),
    travelEvidenceMinutes: params.travelEvidenceMinutes ?? null,
  });

  if (!layers) {
    return null;
  }

  logTimeUntilEventSelection({
    titleQuery,
    referenceNow: params.referenceNow,
    selectedEvent: targetEvent,
    futureMatches: futureMatching,
  });

  logEventDepartureLayers({
    transcript: params.transcript,
    eventTitle: targetEvent.title,
    layers,
  });

  logCalendarTimeUntilDebug({
    query: params.transcript,
    referenceNowIso: params.referenceNow.toISOString(),
    selectedEventTitle: targetEvent.title,
    selectedEventStartIso: targetEvent.startsAt,
    diffMinutes: duration.diffMinutes,
    formattedDuration: duration.formattedDuration,
  });

  const factsReply = buildFactsOnlyTimeUntilReply({
    locale,
    eventTitle: targetEvent.title,
    facts: layers.facts,
    isPast: duration.isPast,
    isNow: duration.isNow,
  });

  if (!isExplicitDeparturePlanningQuery(params.transcript)) {
    return factsReply;
  }

  const recommendation = buildDepartureRecommendationText({
    locale,
    eventTitle: targetEvent.title,
    layers,
  });

  if (!recommendation) {
    return factsReply;
  }

  return `${factsReply}\n\n${recommendation}`;
}
