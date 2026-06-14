import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { requiresCalendarCommandExecution } from '@/src/features/agent/calendar/calendarCommandTypes';
import {
  getConversationEventMemory,
  recordCreatedConversationEvent,
  recordModifiedConversationEvent,
  resetConversationEventMemory,
  resolveMoveEventReference,
} from '@/src/features/agent/calendar/calendarConversationEventMemory';
import {
  buildMoveClarificationPendingActionFields,
  resolveStoredMoveClarificationReply,
} from '@/src/features/agent/calendar/calendarMoveClarificationState';
import { isAwaitingEventDisambiguationSelectionReply } from '@/src/features/agent/calendar/calendarPendingReplyClassifier';
import { isCalendarReadOnlyQuery } from '@/src/features/agent/calendar/calendarReadOnlyQuery';
import { enrichCalendarCommandTranscript } from '@/src/features/agent/calendar/calendarTranscriptEnrichment';
import { extractCalendarUpdateParameters } from '@/src/features/agent/calendar/calendarUpdateIntentExtractor';
import { mergeActionContextFromHistory } from '@/src/features/agent/intent/actionContextMerge';
import {
  buildCalendarPendingAction,
  resetCalendarConversationState,
  transitionCalendarConversationState,
} from '@/src/features/agent/calendar/calendarConversationState';
import {
  clearPendingCalendarUpdateIntent,
  getPendingCalendarUpdateContext,
} from '@/src/features/agent/execution/calendarExecutionSession';
import { findCalendarEventForUpdateFromEvents } from '@/src/features/agent/calendarIntelligence/eventAtTimeMatch';

const referenceNow = new Date('2026-06-04T18:00:00-05:00');
const timeZone = 'America/Chicago';

function meditationEvent(id: string, startISO: string, endISO: string) {
  return {
    id,
    title: 'Meditation',
    startsAt: startISO,
    endsAt: endISO,
    isAllDay: false as const,
  };
}

function seedRelativeMoveClarification() {
  clearPendingCalendarUpdateIntent();
  resetCalendarConversationState('test_reset');

  const sourceTranscript = 'Move meditation one hour earlier';
  const candidates = [
    {
      eventId: 'med-today',
      title: 'Meditation',
      startsAt: '2026-06-04T23:00:00-05:00',
      endsAt: '2026-06-05T00:00:00-05:00',
    },
    {
      eventId: 'med-tomorrow',
      title: 'Meditation',
      startsAt: '2026-06-05T22:00:00-05:00',
      endsAt: '2026-06-05T23:00:00-05:00',
    },
  ];

  const extracted = extractCalendarUpdateParameters(sourceTranscript, referenceNow);
  const clarificationFields = buildMoveClarificationPendingActionFields(candidates);
  const pendingAction = buildCalendarPendingAction({
    actionType: 'update',
    originalIntent: sourceTranscript,
    eventTitle: 'Meditation',
    sourceTranscript,
    languageCode: 'en-US',
    proposedStartMs: Date.parse('2026-06-05T21:00:00-05:00'),
    proposedEndMs: Date.parse('2026-06-05T22:00:00-05:00'),
    updateFromStartISO: extracted.fromStartISO,
    updateToStartISO: extracted.toStartISO,
    ...clarificationFields,
  });

  transitionCalendarConversationState({
    toState: 'WAITING_EVENT_SELECTION',
    pendingAction,
    reason: 'test_relative_move_clarification',
  });

  return { sourceTranscript, candidates };
}

describe('calendar conversational memory acceptance', () => {
  beforeEach(() => {
    resetConversationEventMemory('test_reset');
    resetCalendarConversationState('test_reset');
    clearPendingCalendarUpdateIntent();
  });

  it('TEST 1: create then move one hour earlier via pronoun without clarification', () => {
    recordCreatedConversationEvent({
      eventId: 'med-1',
      title: 'Meditation',
      startISO: '2026-06-04T23:00:00-05:00',
      endISO: '2026-06-05T00:00:00-05:00',
    });

    const enriched = enrichCalendarCommandTranscript({
      transcript: 'Move it one hour earlier',
      referenceNow,
    });

    assert.match(enriched, /meditation/i);

    const extraction = extractCalendarUpdateParameters(enriched, referenceNow);
    assert.equal(extraction.readyToExecute, true);

    const resolution = findCalendarEventForUpdateFromEvents({
      transcript: enriched,
      referenceNow,
      events: [
        meditationEvent('med-1', '2026-06-04T23:00:00-05:00', '2026-06-05T00:00:00-05:00'),
      ],
      titleQuery: extraction.title ?? 'Meditation',
      timeZone,
    });

    assert.equal(resolution.ambiguous, false);
    assert.equal(resolution.match?.id, 'med-1');
    assert.equal(resolution.matchSource, 'conversation_memory');
  });

  it('TEST 2: create then move to tomorrow via pronoun on same event', () => {
    recordCreatedConversationEvent({
      eventId: 'med-1',
      title: 'Meditation',
      startISO: '2026-06-04T23:00:00-05:00',
      endISO: '2026-06-05T00:00:00-05:00',
    });

    const enriched = enrichCalendarCommandTranscript({
      transcript: 'Move it to tomorrow',
      referenceNow,
    });

    assert.match(enriched, /meditation/i);

    const resolution = findCalendarEventForUpdateFromEvents({
      transcript: enriched,
      referenceNow,
      events: [
        meditationEvent('med-1', '2026-06-04T23:00:00-05:00', '2026-06-05T00:00:00-05:00'),
      ],
      titleQuery: 'Meditation',
      timeZone,
    });

    assert.equal(resolution.match?.id, 'med-1');
    assert.equal(resolution.matchSource, 'conversation_memory');
  });

  it('TEST 3: ambiguous move clarification completes on Tomorrow 22:00 without read routing', () => {
    const { sourceTranscript } = seedRelativeMoveClarification();
    const selectionReply = 'Tomorrow 22:00';

    assert.equal(isAwaitingEventDisambiguationSelectionReply(selectionReply, referenceNow), true);
    assert.equal(isCalendarReadOnlyQuery(selectionReply, referenceNow), false);
    assert.equal(requiresCalendarCommandExecution(selectionReply), true);

    const merged = mergeActionContextFromHistory({
      transcript: selectionReply,
      messages: [],
      referenceNow,
    });

    assert.equal(merged.contextSource, 'pending_update_clarification');
    assert.equal(merged.mergedTranscript, sourceTranscript);

    const resolved = resolveStoredMoveClarificationReply({
      reply: selectionReply,
      referenceNow,
    });

    assert.ok(resolved);
    assert.equal(resolved!.selectedEventId, 'med-tomorrow');
    assert.equal(resolved!.readyToExecute, true);
    assert.equal(
      Date.parse(resolved!.context.toStartISO!),
      Date.parse('2026-06-05T21:00:00-05:00'),
    );
    assert.equal(getPendingCalendarUpdateContext()?.selectedEventId, 'med-tomorrow');
  });

  it('TEST 4: bare Move it resolves from lastReferencedEvent', () => {
    recordCreatedConversationEvent({
      eventId: 'med-1',
      title: 'Meditation',
      startISO: '2026-06-04T22:00:00-05:00',
      endISO: '2026-06-04T22:30:00-05:00',
    });

    const enriched = enrichCalendarCommandTranscript({
      transcript: 'Move it',
      referenceNow,
    });

    assert.match(enriched, /meditation/i);
    assert.equal(resolveMoveEventReference(referenceNow)?.eventId, 'med-1');
  });

  it('TEST 5: chained pronoun moves keep the same lastReferenced event', () => {
    recordCreatedConversationEvent({
      eventId: 'med-1',
      title: 'Meditation',
      startISO: '2026-06-04T23:00:00-05:00',
      endISO: '2026-06-05T00:00:00-05:00',
    });

    recordModifiedConversationEvent({
      eventId: 'med-1',
      title: 'Meditation',
      startISO: '2026-06-04T22:00:00-05:00',
      endISO: '2026-06-04T22:30:00-05:00',
    });

    const secondMove = enrichCalendarCommandTranscript({
      transcript: 'Move it to tomorrow',
      referenceNow,
    });

    assert.match(secondMove, /meditation/i);
    assert.equal(getConversationEventMemory().lastReferencedEvent?.eventId, 'med-1');

    const resolution = findCalendarEventForUpdateFromEvents({
      transcript: secondMove,
      referenceNow,
      events: [
        meditationEvent('med-1', '2026-06-04T22:00:00-05:00', '2026-06-04T22:30:00-05:00'),
      ],
      titleQuery: 'Meditation',
      timeZone,
    });

    assert.equal(resolution.match?.id, 'med-1');
    assert.equal(resolution.matchSource, 'conversation_memory');
  });
});
