import {
  eventStartMatchesConversationMemory,
  getConversationMemoryForMoveValidation,
  type ConversationEventRecord,
} from '@/src/features/agent/calendar/calendarConversationEventMemory';
import { calendarConversationTitlesMatch } from '@/src/features/agent/calendar/calendarConversationTitleMatch';
import { isIgnorableTitleQueryForMemory } from '@/src/features/agent/calendar/calendarEventReferenceTokens';

/**
 * Rejects calendar matches whose start time disagrees with conversational memory.
 * Prefer memory schedule over fuzzy title-only hits.
 */
export function validateMoveTargetAgainstConversationMemory(params: {
  event: { id: string; title: string; startsAt: string } | null;
  referenceNow: Date;
  matchSource: string;
  titleQuery?: string;
}) {
  if (!params.event) {
    return { ok: false as const, event: null, memoryRef: null };
  }

  const memoryRef = getConversationMemoryForMoveValidation(params.referenceNow);

  if (!memoryRef) {
    return { ok: true as const, event: params.event, memoryRef: null };
  }

  if (params.matchSource === 'conversation_memory') {
    return { ok: true as const, event: params.event, memoryRef };
  }

  if (eventStartMatchesConversationMemory(memoryRef, params.event)) {
    return { ok: true as const, event: params.event, memoryRef };
  }

  const titleQuery = params.titleQuery?.trim() ?? '';
  const eventSameAsMemory = calendarConversationTitlesMatch(
    params.event.title,
    memoryRef.title,
  );
  const querySameAsMemory =
    Boolean(titleQuery) &&
    !isIgnorableTitleQueryForMemory(titleQuery) &&
    calendarConversationTitlesMatch(titleQuery, memoryRef.title);

  if (eventSameAsMemory || querySameAsMemory) {
    console.log('[MOVE REJECTED] conversational event schedule mismatch vs memory');
    console.log(
      JSON.stringify({
        memoryTitle: memoryRef.title,
        memoryStart: memoryRef.startISO,
        matchedTitle: params.event.title,
        matchedStart: params.event.startsAt,
        matchSource: params.matchSource,
        titleQuery: titleQuery || null,
        eventSameAsMemory,
        querySameAsMemory,
      }),
    );

    return { ok: false as const, event: null, memoryRef };
  }

  const userNamedDifferentEvent =
    Boolean(titleQuery) &&
    !isIgnorableTitleQueryForMemory(titleQuery) &&
    !calendarConversationTitlesMatch(titleQuery, memoryRef.title);
  const matchIsDifferentEvent = !calendarConversationTitlesMatch(
    params.event.title,
    memoryRef.title,
  );

  if (userNamedDifferentEvent && matchIsDifferentEvent) {
    return { ok: true as const, event: params.event, memoryRef };
  }

  console.log('[MOVE REJECTED] calendar event start conflicts with conversation memory');
  console.log(
    JSON.stringify({
      memoryTitle: memoryRef.title,
      memoryStart: memoryRef.startISO,
      matchedTitle: params.event.title,
      matchedStart: params.event.startsAt,
      matchSource: params.matchSource,
      titleQuery: titleQuery || null,
    }),
  );

  return { ok: false as const, event: null, memoryRef };
}
