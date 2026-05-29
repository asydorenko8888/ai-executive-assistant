import type { CalendarEvent } from '@/src/entities/calendar/types';
import { buildHumanizedCalendarGuidanceLine } from '@/src/features/agent/calendar/calendarHumanizedReply';
import { filterVisibleCalendarEvents } from '@/src/features/agent/calendar/calendarVisibleEvents';
import { formatTimeInLocalTimezone } from '@/src/features/agent/calendar/calendarTime';
import {
  filterEventsOnLocalDay,
  isCalendarAgendaQuery,
  resolveAgendaQueryDayOffset,
} from '@/src/features/agent/calendar/calendarAgendaSync';
import { buildDeterministicCalendarAnswer } from '@/src/features/agent/calendarIntelligence/calendarAnswerEngine';
import { isDeterministicCalendarReadQuery } from '@/src/features/agent/calendarIntelligence/classifyQuery';
import { getExecutiveCalendarTimezone } from '@/src/features/agent/calendar/calendarTimezone';
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

  const transcript = params.userTranscript?.trim() ?? '';
  const deterministicRead =
    transcript.length > 0 && isDeterministicCalendarReadQuery(transcript);

  if (deterministicRead) {
    lines.push(
      'Calendar read query: NEVER invent events, times, overlaps, or free windows. Use ONLY the deterministic calendar facts below. Ignore chat memory, rolling summaries, and prior assistant schedule answers.',
    );
  } else if (transcript && isCalendarAgendaQuery(transcript)) {
    lines.push(
      'Calendar agenda query: answer ONLY from the authoritative Google Calendar list in this turn. Ignore earlier chat turns, rolling session summaries, voice session facts, and memory about prior schedule answers.',
    );
  }

  if (transcript && deterministicRead) {
    const answer = buildDeterministicCalendarAnswer({
      transcript,
      events: visibleEvents,
      referenceNow: params.referenceNow,
      timeZone: getExecutiveCalendarTimezone(),
    });

    if (answer) {
      lines.push(
        `Deterministic calendar facts (${answer.day.dateKey}, intent=${answer.intent}): ${JSON.stringify(answer.payload)}`,
      );

      if (answer.intent === 'events_at_time' || answer.intent === 'events_starting_at_time' || answer.intent === 'count_at_time') {
        const atTimeEvents = (answer.payload.atTimeEvents ?? []) as Array<{ startISO: string; title: string }>;

        lines.push(
          `Events at requested time (${answer.payload.readTimeKind ?? answer.intent}): ${
            atTimeEvents.map((event) => `${event.startISO} ${event.title}`).join('; ') || 'none'
          }.`,
        );
      } else {
        lines.push(
          `Normalized events: ${answer.events
            .map((event) => `${event.startISO} ${event.title}`)
            .join('; ') || 'none'}.`,
        );
      }
    }
  }

  if (!(transcript && deterministicRead)) {
    lines.push(buildAssistantVisibleCalendarEventsLine(visibleEvents));
  }

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
