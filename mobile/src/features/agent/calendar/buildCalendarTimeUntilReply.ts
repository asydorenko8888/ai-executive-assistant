import type { CalendarEvent } from '@/src/entities/calendar/types';
import { buildCalendarQueryUncertainReply } from '@/src/features/agent/calendar/calendarAuthUserReplies';
import { loadCalendarQueryEvents } from '@/src/features/agent/calendar/calendarQueryEventSource';
import { tryBuildCalendarTimeUntilReplyFromEvents } from '@/src/features/agent/calendar/calendarTimeUntilReply';
import { isCalendarTimeUntilEventQuery } from '@/src/features/agent/calendar/calendarTimeUntilQuery';
import { getExecutiveCalendarTimezone } from '@/src/features/agent/calendar/calendarTimezone';
import { resolveTargetDayContext } from '@/src/features/agent/calendarIntelligence/resolveTargetDay';
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

  return tryBuildCalendarTimeUntilReplyFromEvents({
    transcript: params.transcript,
    languageCode: params.languageCode,
    referenceNow: params.referenceNow,
    events: rawEvents,
  });
}
