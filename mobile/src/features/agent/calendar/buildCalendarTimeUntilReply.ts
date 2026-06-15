import type { CalendarEvent } from '@/src/entities/calendar/types';
import { buildCalendarQueryUncertainReply } from '@/src/features/agent/calendar/calendarAuthUserReplies';
import { loadCalendarEventsForTimeUntilQuery } from '@/src/features/agent/calendar/calendarQueryEventSource';
import { tryBuildCalendarTimeUntilReplyFromEvents } from '@/src/features/agent/calendar/calendarTimeUntilReply';
import { isCalendarTimeUntilEventQuery } from '@/src/features/agent/calendar/calendarTimeUntilQuery';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';

export { tryBuildCalendarTimeUntilReplyFromEvents } from '@/src/features/agent/calendar/calendarTimeUntilReply';

export async function tryBuildCalendarTimeUntilReply(params: {
  transcript: string;
  languageCode: VoiceLanguageCode;
  referenceNow: Date;
  calendarConnected: boolean;
  prefetchedEvents?: CalendarEvent[];
}): Promise<string | null> {
  if (!params.calendarConnected || !isCalendarTimeUntilEventQuery(params.transcript)) {
    return null;
  }

  const { events: rawEvents, calendarTrustworthy } = await loadCalendarEventsForTimeUntilQuery({
    referenceNow: params.referenceNow,
    supplementalEvents: params.prefetchedEvents,
  });

  if (!calendarTrustworthy) {
    return buildCalendarQueryUncertainReply(params.languageCode);
  }

  return tryBuildCalendarTimeUntilReplyFromEvents({
    transcript: params.transcript,
    languageCode: params.languageCode,
    referenceNow: params.referenceNow,
    events: rawEvents,
  });
}
