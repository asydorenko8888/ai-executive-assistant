import type { CalendarEvent } from '@/src/entities/calendar/types';
import { isCalendarReadOnlyQuery } from '@/src/features/agent/calendar/calendarReadOnlyQuery';
import { logCalendarReadReplyBuilt } from '@/src/features/agent/calendar/calendarReadReplyMarkers';
import { tryBuildCalendarTimeUntilReplyFromEvents } from '@/src/features/agent/calendar/calendarTimeUntilReply';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguageLocale';

export { logCalendarReadReplyBuilt } from '@/src/features/agent/calendar/calendarReadReplyMarkers';

export function tryBuildCalendarReadReplyFromEvents(params: {
  transcript: string;
  languageCode: VoiceLanguageCode;
  referenceNow: Date;
  calendarConnected: boolean;
  events: CalendarEvent[];
}): string | null {
  if (!params.calendarConnected || !isCalendarReadOnlyQuery(params.transcript)) {
    return null;
  }

  const timeUntilReply = tryBuildCalendarTimeUntilReplyFromEvents({
    transcript: params.transcript,
    languageCode: params.languageCode,
    referenceNow: params.referenceNow,
    events: params.events,
  });

  if (timeUntilReply?.trim()) {
    return timeUntilReply.trim();
  }

  return null;
}

export async function tryBuildCalendarReadReply(params: {
  transcript: string;
  languageCode: VoiceLanguageCode;
  referenceNow: Date;
  calendarConnected: boolean;
  prefetchedEvents?: CalendarEvent[];
}): Promise<string | null> {
  if (!params.calendarConnected || !isCalendarReadOnlyQuery(params.transcript)) {
    return null;
  }

  if (params.prefetchedEvents?.length) {
    const fromEvents = tryBuildCalendarReadReplyFromEvents({
      transcript: params.transcript,
      languageCode: params.languageCode,
      referenceNow: params.referenceNow,
      calendarConnected: params.calendarConnected,
      events: params.prefetchedEvents,
    });

    if (fromEvents) {
      return fromEvents;
    }
  }

  const { tryBuildDeterministicCalendarReply } = await import(
    '@/src/features/agent/calendarIntelligence/buildDeterministicReply'
  );
  const { classifyCalendarQueryIntent } = await import(
    '@/src/features/agent/calendarIntelligence/classifyQuery'
  );

  const deterministicReply = await tryBuildDeterministicCalendarReply({
    transcript: params.transcript,
    languageCode: params.languageCode,
    referenceNow: params.referenceNow,
    calendarConnected: params.calendarConnected,
    prefetchedEvents: params.prefetchedEvents,
  });

  if (deterministicReply?.trim()) {
    logCalendarReadReplyBuilt({
      intent: classifyCalendarQueryIntent(params.transcript) ?? 'calendar_read',
      transcriptPreview: params.transcript,
      title: null,
      start: null,
      durationText: null,
    });

    return deterministicReply.trim();
  }

  if (params.prefetchedEvents?.length) {
    return tryBuildCalendarReadReplyFromEvents({
      transcript: params.transcript,
      languageCode: params.languageCode,
      referenceNow: params.referenceNow,
      calendarConnected: params.calendarConnected,
      events: params.prefetchedEvents,
    });
  }

  return null;
}
