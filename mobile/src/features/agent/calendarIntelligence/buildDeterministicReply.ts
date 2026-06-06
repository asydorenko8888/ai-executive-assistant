import type { CalendarEvent } from '@/src/entities/calendar/types';
import { buildDeterministicCalendarAnswer } from '@/src/features/agent/calendarIntelligence/calendarAnswerEngine';
import {
  classifyCalendarQueryIntent,
  isDeterministicCalendarReadQuery,
} from '@/src/features/agent/calendarIntelligence/classifyQuery';
import { logReadEventList } from '@/src/features/agent/calendarIntelligence/calendarReadDiagnostics';
import { formatDeterministicCalendarReply } from '@/src/features/agent/calendarIntelligence/formatDeterministicReply';
import { buildCalendarQueryUncertainReply } from '@/src/features/agent/calendar/calendarAuthUserReplies';
import { loadCalendarQueryEvents } from '@/src/features/agent/calendar/calendarQueryEventSource';
import { getExecutiveCalendarTimezone } from '@/src/features/agent/calendar/calendarTimezone';
import { resolveTargetDayContext } from '@/src/features/agent/calendarIntelligence/resolveTargetDay';
import type { CalendarFreeSlot, NormalizedCalendarEvent } from '@/src/features/agent/calendarIntelligence/types';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { getChatLocaleFromVoiceLanguage } from '@/src/features/chat/services/voiceLanguage';

export { isDeterministicCalendarReadQuery, classifyCalendarQueryIntent } from '@/src/features/agent/calendarIntelligence/classifyQuery';
export { buildDeterministicCalendarAnswer } from '@/src/features/agent/calendarIntelligence/calendarAnswerEngine';

export async function tryBuildDeterministicCalendarReply(params: {
  transcript: string;
  languageCode: VoiceLanguageCode;
  referenceNow: Date;
  calendarConnected: boolean;
  prefetchedEvents?: CalendarEvent[];
}): Promise<string | null> {
  if (!params.calendarConnected || !isDeterministicCalendarReadQuery(params.transcript)) {
    return null;
  }

  const intent = classifyCalendarQueryIntent(params.transcript);

  if (!intent) {
    return null;
  }

  const timeZone = getExecutiveCalendarTimezone();
  const day = resolveTargetDayContext(params.transcript, params.referenceNow, timeZone);

  const { events: rawEvents, calendarTrustworthy } = await loadCalendarQueryEvents({
    referenceNow: params.referenceNow,
    day,
    transcript: params.transcript,
    supplementalEvents: params.prefetchedEvents,
  });

  if (!calendarTrustworthy) {
    return buildCalendarQueryUncertainReply(params.languageCode);
  }

  logReadEventList({
    transcript: params.transcript,
    dayDateKey: day.dateKey,
    events: rawEvents,
  });

  const answer = buildDeterministicCalendarAnswer({
    transcript: params.transcript,
    events: rawEvents,
    referenceNow: params.referenceNow,
    timeZone,
  });

  if (!answer) {
    return null;
  }

  const locale = getChatLocaleFromVoiceLanguage(params.languageCode);
  const payload = answer.payload;

  const reply = formatDeterministicCalendarReply({
    intent: answer.intent,
    day: answer.day,
    locale,
    events: answer.events,
    referenceNow: params.referenceNow,
    userTranscript: params.transcript,
    atTimeEvents: payload.atTimeEvents as NormalizedCalendarEvent[] | undefined,
    clockMinutes: payload.clockMinutes as number | null | undefined,
    nextEvent: payload.nextEvent as NormalizedCalendarEvent | null | undefined,
    lastEvent: payload.lastEvent as NormalizedCalendarEvent | null | undefined,
    freeSlots: payload.freeSlots as CalendarFreeSlot[] | undefined,
    bestSlot: payload.bestSlot as CalendarFreeSlot | null | undefined,
    overlaps: payload.overlaps as Array<{
      first: NormalizedCalendarEvent;
      second: NormalizedCalendarEvent;
    }> | undefined,
    requestedDurationMinutes: payload.durationMinutes as number | undefined,
  });

  console.log('[Calendar Deterministic Answer]', {
    intent: answer.intent,
    dateKey: answer.day.dateKey,
    eventCount: answer.events.length,
    reply,
    payload: answer.payload,
  });

  return reply.trim() || null;
}
