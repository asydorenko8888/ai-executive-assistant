import type { CalendarEvent } from '@/src/entities/calendar/types';
import {
  findMoveConversationEventInList,
  resolveMoveEventReference,
} from '@/src/features/agent/calendar/calendarConversationEventMemory';
import {
  isEventPronounReference,
  isIgnorableTitleQueryForMemory,
  resolveEventTitleQueryForMemory,
} from '@/src/features/agent/calendar/calendarEventReferenceTokens';
import { getExecutiveCalendarTimezone } from '@/src/features/agent/calendar/calendarTimezone';
import {
  classifyTitleMatchTier,
  type TitleMatchTier,
} from '@/src/features/agent/calendar/calendarTitleMatchPriority';
import { extractUpdateEventTitle } from '@/src/features/agent/calendar/calendarUpdateIntentExtractor';
import {
  parseCalendarUpdateSchedule,
  resolveUpdateTargetMs,
  type CalendarUpdateSchedule,
} from '@/src/features/agent/calendar/calendarUpdateScheduleParser';
import {
  collapseCalendarEventCandidates,
  deduplicateCalendarEvents,
  logCalendarEventDeduplication,
} from '@/src/features/agent/calendar/calendarEventDeduplication';
import { normalizeCalendarEvents } from '@/src/features/agent/calendarIntelligence/normalizeEvents';
import { getEventsStartingAtTime } from '@/src/features/agent/calendarIntelligence/scheduleHelpers';
import { resolveTargetDayContext } from '@/src/features/agent/calendarIntelligence/resolveTargetDay';
import { EVENT_PRONOUN_REFERENCE } from '@/src/features/agent/calendar/calendarEventReferenceTokens';

const NO_OP_TOLERANCE_MS = 60_000;

export type CalendarUpdateResolutionFailureReason =
  | 'no_event_name'
  | 'not_found'
  | 'ambiguous'
  | 'time_parse_failed'
  | 'no_time_change';

export type CalendarUpdateResolutionTier = TitleMatchTier | 'conversation_memory' | 'pronoun_memory';

export type CalendarUpdateResolvedIntent =
  | {
      ok: true;
      target: CalendarEvent;
      requestedEventName: string;
      resolutionTier: CalendarUpdateResolutionTier;
      requestedStartMs: number;
      requestedEndMs: number;
      originalStartMs: number;
      originalEndMs: number;
      candidates: CalendarEvent[];
    }
  | {
      ok: false;
      reason: CalendarUpdateResolutionFailureReason;
      requestedEventName: string | null;
      candidates: CalendarEvent[];
      detail: string;
      /** Set when target was found but destination time could not be parsed. */
      target?: CalendarEvent | null;
    };

function transcriptUsesEventPronoun(transcript: string) {
  return EVENT_PRONOUN_REFERENCE.test(transcript.trim());
}

function disambiguateTitleMatchesByFromTime(params: {
  titleMatches: CalendarEvent[];
  schedule: CalendarUpdateSchedule;
  transcript: string;
  referenceNow: Date;
  timeZone: string;
}) {
  if (params.titleMatches.length <= 1 || !params.schedule.ok || params.schedule.kind !== 'from_to') {
    return null;
  }

  const day = resolveTargetDayContext(params.transcript, params.referenceNow, params.timeZone);
  const normalized = normalizeCalendarEvents(params.titleMatches, params.timeZone);
  const atFrom = getEventsStartingAtTime(normalized, day, params.schedule.fromMinutes);
  const ids = new Set(atFrom.map((event) => event.id));
  const filtered = params.titleMatches.filter((event) => ids.has(event.id));

  return filtered.length === 1 ? filtered[0] : null;
}

/**
 * Step 1–3 of the update pipeline: resolve target event by name (or pronoun memory), then requested time.
 * Never selects a different event because another event occupies the destination slot.
 */
export function resolveCalendarUpdateIntent(params: {
  transcript: string;
  referenceNow: Date;
  events: CalendarEvent[];
  timeZone?: string;
}): CalendarUpdateResolvedIntent {
  const timeZone = params.timeZone ?? getExecutiveCalendarTimezone();
  const activeEvents = deduplicateCalendarEvents(params.events.filter((event) => !event.isCancelled));
  const extractedTitle = extractUpdateEventTitle(params.transcript);
  const memoryRef = resolveMoveEventReference(params.referenceNow);
  const requestedEventName = resolveEventTitleQueryForMemory({
    extractedTitle,
    memoryTitle: memoryRef?.title ?? null,
  }).trim();

  let target: CalendarEvent | null = null;
  let resolutionTier: CalendarUpdateResolutionTier = 'exact';
  let candidates: CalendarEvent[] = [];

  if (requestedEventName && !isIgnorableTitleQueryForMemory(requestedEventName)) {
    const titleMatches = activeEvents.filter(
      (event) => classifyTitleMatchTier(requestedEventName, event.title) !== 'none',
    );

    if (titleMatches.length === 0) {
      return {
        ok: false,
        reason: 'not_found',
        requestedEventName,
        candidates: [],
        detail: `No calendar event named "${requestedEventName}"`,
      };
    }

    const collapsedMatches = collapseCalendarEventCandidates(titleMatches);

    if (collapsedMatches.length > 1) {
      const fromTimePick = disambiguateTitleMatchesByFromTime({
        titleMatches: collapsedMatches,
        schedule: parseCalendarUpdateSchedule(params.transcript, params.referenceNow, timeZone),
        transcript: params.transcript,
        referenceNow: params.referenceNow,
        timeZone,
      });

      if (fromTimePick) {
        target = fromTimePick;
        resolutionTier = classifyTitleMatchTier(requestedEventName, fromTimePick.title);
        candidates = [fromTimePick];
      } else {
        logCalendarEventDeduplication({
          stage: 'update_resolution_ambiguous',
          rawCount: activeEvents.length,
          matchedBeforeDedupe: titleMatches.length,
          matchedAfterDedupe: collapsedMatches.length,
        });

        return {
          ok: false,
          reason: 'ambiguous',
          requestedEventName,
          candidates: collapsedMatches,
          detail: `Multiple events match "${requestedEventName}"`,
        };
      }
    } else {
      target = collapsedMatches[0];
      resolutionTier = classifyTitleMatchTier(requestedEventName, collapsedMatches[0].title);
      candidates = [collapsedMatches[0]];
    }
  } else if (transcriptUsesEventPronoun(params.transcript) || isEventPronounReference(requestedEventName)) {
    target = findMoveConversationEventInList({
      events: activeEvents,
      referenceNow: params.referenceNow,
      titleQuery: '',
    });
    resolutionTier = 'pronoun_memory';
    candidates = target ? [target] : [];
  } else if (memoryRef && !extractedTitle) {
    target = findMoveConversationEventInList({
      events: activeEvents,
      referenceNow: params.referenceNow,
      titleQuery: '',
    });
    resolutionTier = 'conversation_memory';
    candidates = target ? [target] : [];
  }

  if (!target) {
    return {
      ok: false,
      reason: requestedEventName ? 'not_found' : 'no_event_name',
      requestedEventName: requestedEventName || null,
      candidates,
      detail: requestedEventName
        ? `Could not find "${requestedEventName}" on the calendar`
        : 'Could not determine which event to update',
    };
  }

  const resolvedName = requestedEventName || target.title.trim();

  if (
    requestedEventName &&
    classifyTitleMatchTier(requestedEventName, target.title) === 'none'
  ) {
    return {
      ok: false,
      reason: 'not_found',
      requestedEventName,
      candidates: [],
      detail: `Resolved event "${target.title}" does not match requested "${requestedEventName}"`,
      target: null,
    };
  }

  const originalStartMs = Date.parse(target.startsAt);
  const originalEndMs = Date.parse(target.endsAt);

  if (Number.isNaN(originalStartMs) || Number.isNaN(originalEndMs)) {
    return {
      ok: false,
      reason: 'not_found',
      requestedEventName: resolvedName,
      candidates: [],
      detail: 'Target event has invalid timestamps',
      target,
    };
  }

  const schedule = parseCalendarUpdateSchedule(params.transcript, params.referenceNow, timeZone);

  if (!schedule.ok) {
    return {
      ok: false,
      reason: 'time_parse_failed',
      requestedEventName: resolvedName,
      candidates: [target],
      detail: schedule.detail,
      target,
    };
  }

  const requestedStartMs = resolveUpdateTargetMs({
    schedule,
    matchedEventStartMs: originalStartMs,
    referenceNow: params.referenceNow,
    timeZone,
  });

  if (requestedStartMs === null || Number.isNaN(requestedStartMs)) {
    return {
      ok: false,
      reason: 'time_parse_failed',
      requestedEventName: resolvedName,
      candidates: [target],
      detail: 'Could not resolve destination time for the update',
      target,
    };
  }

  if (Math.abs(requestedStartMs - originalStartMs) <= NO_OP_TOLERANCE_MS) {
    return {
      ok: false,
      reason: 'no_time_change',
      requestedEventName: resolvedName,
      candidates: [target],
      detail: 'Requested time matches the current start time of the target event',
      target,
    };
  }

  const durationMs = Math.max(originalEndMs - originalStartMs, 30 * 60_000);
  const requestedEndMs = requestedStartMs + durationMs;

  logCalendarEventDeduplication({
    stage: 'update_resolution_selected',
    rawCount: activeEvents.length,
    deduplicatedCount: activeEvents.length,
    selectedEventId: target.id,
  });

  console.log('[CALENDAR UPDATE RESOLUTION]');
  console.log(
    JSON.stringify({
      requestedEventName: resolvedName,
      resolvedEventId: target.id,
      resolvedEventTitle: target.title,
      resolutionTier,
      originalStart: target.startsAt,
      requestedStart: new Date(requestedStartMs).toISOString(),
    }),
  );

  return {
    ok: true,
    target,
    requestedEventName: resolvedName,
    resolutionTier,
    requestedStartMs,
    requestedEndMs,
    originalStartMs,
    originalEndMs,
    candidates: [target],
  };
}

export function assertResolvedTargetMatchesPayload(params: {
  resolution: Extract<CalendarUpdateResolvedIntent, { ok: true }>;
  payloadEventId: string;
  payloadTitle: string;
}) {
  if (params.payloadEventId !== params.resolution.target.id) {
    return {
      ok: false as const,
      detail: `Payload event ${params.payloadEventId} does not match target ${params.resolution.target.id}`,
    };
  }

  const tier = classifyTitleMatchTier(
    params.resolution.requestedEventName,
    params.payloadTitle,
  );

  if (tier === 'none') {
    return {
      ok: false as const,
      detail: `Payload title "${params.payloadTitle}" does not match requested "${params.resolution.requestedEventName}"`,
    };
  }

  return { ok: true as const };
}
