import type { CalendarEvent } from '@/src/entities/calendar/types';
import {
  formatDurationUntilFromEventStartIso,
  logCalendarTimeUntilDebug,
  type CalendarDurationLocale,
} from '@/src/features/agent/calendar/calendarDurationUntil';
import { logCalendarReadReplyBuilt } from '@/src/features/agent/calendar/calendarReadReplyMarkers';
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
  getTimeUntilNoTitleMatchMessage,
  isCalendarTimeUntilEventQuery,
  logTimeUntilEventSelection,
} from '@/src/features/agent/calendar/calendarTimeUntilQuery';
import { getExecutiveCalendarTimezone } from '@/src/features/agent/calendar/calendarTimezone';
import {
  getChatLocaleFromVoiceLanguage,
  type VoiceLanguageCode,
} from '@/src/features/chat/services/voiceLanguageLocale';

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
      const noFutureReply = getTimeUntilNoFutureMatchMessage(locale);
      logCalendarReadReplyBuilt({
        intent: 'time_until',
        title: titleQuery,
        start: null,
        durationText: null,
        transcriptPreview: params.transcript,
      });
      return noFutureReply;
    }

    const noTitleReply = getTimeUntilNoTitleMatchMessage(locale);
    logCalendarReadReplyBuilt({
      intent: 'time_until',
      title: titleQuery,
      start: null,
      durationText: null,
      transcriptPreview: params.transcript,
    });
    return noTitleReply;
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
    const fallbackReply = buildFactsOnlyTimeUntilReply({
      locale,
      eventTitle: targetEvent.title,
      facts: {
        minutesUntilStart: duration.diffMinutes,
        formattedDuration: duration.formattedDuration,
        eventStartIso: targetEvent.startsAt,
        eventStartLabel: targetEvent.startsAt,
      },
      isPast: duration.isPast,
      isNow: duration.isNow,
    });

    logCalendarReadReplyBuilt({
      intent: 'time_until',
      title: targetEvent.title,
      start: targetEvent.startsAt,
      durationText: duration.formattedDuration,
      transcriptPreview: params.transcript,
    });

    return fallbackReply;
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

  logCalendarReadReplyBuilt({
    intent: 'time_until',
    title: targetEvent.title,
    start: targetEvent.startsAt,
    durationText: layers.facts.formattedDuration,
    transcriptPreview: params.transcript,
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
