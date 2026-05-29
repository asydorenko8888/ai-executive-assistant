import type { CalendarEvent } from '@/src/entities/calendar/types';
import type { ExecutiveAgentOrchestrator } from '@/src/features/agent/agentOrchestrator';
import type { ExecutiveAgentSnapshot } from '@/src/features/agent/types';
import { getAssistantVisibleCalendarEvents } from '@/src/features/agent/calendar/calendarAssistantContext';
import {
  invalidateCalendarVisibilityCaches,
  refreshAgendaVisibilityState,
} from '@/src/features/agent/calendar/calendarAgendaRefresh';
import { getLiveCalendarEvents } from '@/src/features/agent/calendar/calendarLiveState';
import { buildCalendarSummary } from '@/src/features/agent/calendar/googleCalendarService';
import {
  filterUpcomingTimedEvents,
  getEventStartTimestamp,
  sortEventsChronologically,
} from '@/src/features/agent/calendar/calendarSchedule';
import { filterVisibleCalendarEvents } from '@/src/features/agent/calendar/calendarVisibleEvents';
import { getLocalEndOfDay, getLocalStartOfDay } from '@/src/features/agent/calendar/calendarTime';
import {
  classifyCalendarAgendaQueryIntent,
  isCalendarListQuestion,
} from '@/src/features/voice/speech/voiceSpeechFormatter';

const TOMORROW_AGENDA_PATTERNS = [
  /\b(?:завтра|tomorrow)\b/i,
  /\bзадач[аи]?\s+на\s+завтра/i,
  /\bчто\s+завтра/i,
  /\bщо\s+завтра/i,
  /\bwhat.{0,24}tomorrow/i,
];

const TODAY_AGENDA_PATTERNS = [
  /\b(?:сьогодні|сегодня|today)\b/i,
  /\bзадач[аи]?\s+на\s+сегодня/i,
  /\bзадач[аи]?\s+на\s+сьогодні/i,
];

export function isCalendarAgendaQuery(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized) {
    return false;
  }

  return (
    Boolean(classifyCalendarAgendaQueryIntent(normalized)) ||
    isCalendarListQuestion(normalized) ||
    TOMORROW_AGENDA_PATTERNS.some((pattern) => pattern.test(normalized)) ||
    TODAY_AGENDA_PATTERNS.some((pattern) => pattern.test(normalized)) ||
    /\b(?:какие|які|what|which|сколько|скільки).{0,32}(?:задач|tasks?|events?|meetings?|зустріч)/i.test(
      normalized,
    )
  );
}

export function resolveAgendaQueryDayOffset(transcript: string): number | null {
  const normalized = transcript.trim();

  if (TOMORROW_AGENDA_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 1;
  }

  if (TODAY_AGENDA_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 0;
  }

  return null;
}

export function filterEventsOnLocalDay(
  events: CalendarEvent[],
  referenceNow: Date,
  dayOffset: number,
): CalendarEvent[] {
  const day = new Date(referenceNow);
  day.setDate(day.getDate() + dayOffset);
  const dayStart = getLocalStartOfDay(day).getTime();
  const dayEnd = getLocalEndOfDay(day).getTime();

  return sortEventsChronologically(
    events.filter((event) => {
      const startTimestamp = getEventStartTimestamp(event);

      return (
        startTimestamp !== null && startTimestamp >= dayStart && startTimestamp < dayEnd
      );
    }),
  );
}

export function resolveAgendaEventsForQuery(
  events: CalendarEvent[],
  referenceNow: Date,
  userTranscript: string,
) {
  const dayOffset = resolveAgendaQueryDayOffset(userTranscript);

  if (dayOffset !== null) {
    return filterEventsOnLocalDay(events, referenceNow, dayOffset);
  }

  return filterVisibleCalendarEvents(events, referenceNow);
}

export async function clearAssistantCalendarAgendaCache(referenceNow = new Date()) {
  await invalidateCalendarVisibilityCaches(referenceNow);
}

export async function refreshCalendarStateAfterMutation(params: {
  referenceNow: Date;
  eventId?: string | null;
  eventStartIso?: string | null;
  reason?: 'post_create' | 'post_mutation';
}) {
  await clearAssistantCalendarAgendaCache(params.referenceNow);

  return refreshAgendaVisibilityState({
    referenceNow: params.referenceNow,
    eventId: params.eventId ?? null,
    reason: params.reason ?? 'post_mutation',
    eventStartIso: params.eventStartIso ?? null,
    focusDayOffsets: [0, 1],
  });
}

export async function syncFreshCalendarStateForAgendaQuery(params: {
  referenceNow: Date;
  userTranscript: string;
}) {
  const dayOffset = resolveAgendaQueryDayOffset(params.userTranscript);
  const focusDayOffsets =
    dayOffset === null
      ? [0, 1, 2]
      : Array.from(new Set([0, 1, dayOffset, dayOffset + 1]));

  await clearAssistantCalendarAgendaCache(params.referenceNow);

  await refreshAgendaVisibilityState({
    referenceNow: params.referenceNow,
    reason: 'agenda_sync',
    focusDayOffsets,
  });

  return getLiveCalendarEvents();
}

export function patchExecutiveSnapshotCalendar(
  snapshot: ExecutiveAgentSnapshot,
  events: CalendarEvent[],
  referenceNow: Date,
) {
  if (!snapshot.calendarConnection || snapshot.calendarConnection.status !== 'connected') {
    return;
  }

  const sorted = sortEventsChronologically(events);
  snapshot.upcomingCalendarEvents = filterUpcomingTimedEvents(sorted, referenceNow);
  snapshot.calendarSummary = buildCalendarSummary(
    sorted,
    snapshot.calendarConnection,
    referenceNow,
  );
}

export async function ensureFreshCalendarForAgendaTurn(params: {
  orchestrator: ExecutiveAgentOrchestrator;
  referenceNow: Date;
  userTranscript: string;
  calendarConnected: boolean;
}): Promise<CalendarEvent[]> {
  const liveEvents =
    params.calendarConnected && isCalendarAgendaQuery(params.userTranscript)
      ? await syncFreshCalendarStateForAgendaQuery({
          referenceNow: params.referenceNow,
          userTranscript: params.userTranscript,
        })
      : getLiveCalendarEvents();

  if (liveEvents.length > 0) {
    patchExecutiveSnapshotCalendar(params.orchestrator.snapshot, liveEvents, params.referenceNow);
  }

  const snapshotEvents = getAssistantVisibleCalendarEvents(
    params.orchestrator.snapshot,
    params.referenceNow,
  );
  const sourceEvents =
    liveEvents.length > 0 ? liveEvents : snapshotEvents;

  return resolveAgendaEventsForQuery(sourceEvents, params.referenceNow, params.userTranscript);
}
