import type { CalendarEvent } from '@/src/entities/calendar/types';
import { buildHumanizedCalendarGuidanceLine } from '@/src/features/agent/calendar/calendarHumanizedReply';
import { filterVisibleCalendarEvents } from '@/src/features/agent/calendar/calendarVisibleEvents';
import { formatTimeInLocalTimezone } from '@/src/features/agent/calendar/calendarTime';
import {
  filterEventsOnLocalDay,
  isCalendarAgendaQuery,
  resolveAgendaQueryDayOffset,
} from '@/src/features/agent/calendar/calendarAgendaSync';
import type { ExecutiveAgentSnapshot } from '@/src/features/agent/types';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';

export function formatAssistantCalendarEvent(event: CalendarEvent): string {
  const time = formatTimeInLocalTimezone(event.startsAt);
  const locationSuffix = event.location ? ` — ${event.location}` : '';

  return `${time} — ${event.title}${locationSuffix}`;
}

export function getAssistantVisibleCalendarEvents(
  snapshot: ExecutiveAgentSnapshot,
  referenceNow: Date,
): CalendarEvent[] {
  if (snapshot.calendarConnection?.status !== 'connected') {
    return [];
  }

  return filterVisibleCalendarEvents(snapshot.upcomingCalendarEvents, referenceNow);
}

export function buildAssistantVisibleCalendarEventsLine(events: CalendarEvent[]): string {
  if (events.length === 0) {
    return 'No remaining timed events are scheduled on the connected Google Calendar for today.';
  }

  const formattedEvents = events.map(formatAssistantCalendarEvent);

  return `Visible Google Calendar events for today (authoritative list; mention only these, do not invent others): ${formattedEvents.join('; ')}.`;
}

export function buildAssistantCalendarContextLines(params: {
  snapshot: ExecutiveAgentSnapshot;
  referenceNow: Date;
  languageCode?: VoiceLanguageCode;
  userTranscript?: string;
}): string[] {
  let visibleEvents = getAssistantVisibleCalendarEvents(params.snapshot, params.referenceNow);
  const agendaDayOffset = params.userTranscript
    ? resolveAgendaQueryDayOffset(params.userTranscript)
    : null;

  if (agendaDayOffset !== null) {
    visibleEvents = filterEventsOnLocalDay(visibleEvents, params.referenceNow, agendaDayOffset);
  }

  const lines: string[] = [];

  if (params.userTranscript && isCalendarAgendaQuery(params.userTranscript)) {
    lines.push(
      'Calendar agenda query: answer ONLY from the authoritative Google Calendar list in this turn. Ignore earlier chat turns, rolling session summaries, voice session facts, and memory about prior schedule answers.',
    );
  }

  lines.push(buildAssistantVisibleCalendarEventsLine(visibleEvents));

  if (params.languageCode) {
    const guidance = buildHumanizedCalendarGuidanceLine({
      visibleEvents,
      languageCode: params.languageCode,
      referenceNow: params.referenceNow,
      transcript: params.userTranscript,
    });

    if (guidance) {
      lines.push(guidance);
    }
  }

  return lines;
}
