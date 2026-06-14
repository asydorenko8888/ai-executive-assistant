import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveDisambiguationSelection } from '@/src/features/agent/calendar/calendarEventDisambiguation';
import {
  buildMoveClarificationPendingActionFields,
  ensurePendingUpdateContextHydrated,
  getStoredMoveClarificationCandidates,
  resolveStoredMoveClarificationReply,
} from '@/src/features/agent/calendar/calendarMoveClarificationState';
import {
  isAwaitingEventDisambiguationSelectionReply,
  isNewCalendarCommandMessage,
} from '@/src/features/agent/calendar/calendarPendingReplyClassifier';
import { isCalendarReadOnlyQuery } from '@/src/features/agent/calendar/calendarReadOnlyQuery';
import {
  pendingContextFromExtraction,
  tryMergePendingCalendarUpdateReply,
} from '@/src/features/agent/calendar/calendarUpdatePendingContext';
import { extractCalendarUpdateParameters } from '@/src/features/agent/calendar/calendarUpdateIntentExtractor';
import {
  buildCalendarPendingAction,
  resetCalendarConversationState,
  transitionCalendarConversationState,
} from '@/src/features/agent/calendar/calendarConversationState';
import {
  clearPendingCalendarUpdateIntent,
  getPendingCalendarUpdateContext,
  setPendingCalendarUpdateContext,
} from '@/src/features/agent/execution/calendarExecutionSession';

const referenceNow = new Date('2026-05-28T20:00:00-05:00');
const timeZone = 'America/Chicago';
const sourceTranscript = 'Перенеси медитацию на завтра';

const candidates = [
  {
    eventId: 'med-8pm',
    title: 'Медитация',
    startsAt: '2026-05-28T20:00:00-05:00',
    endsAt: '2026-05-28T21:00:00-05:00',
  },
  {
    eventId: 'med-11pm',
    title: 'Медитация',
    startsAt: '2026-05-28T23:00:00-05:00',
    endsAt: '2026-05-29T00:00:00-05:00',
  },
];

function seedMoveClarificationWithoutUpdateContext() {
  clearPendingCalendarUpdateIntent();
  resetCalendarConversationState('test_reset');

  const extracted = extractCalendarUpdateParameters(sourceTranscript, referenceNow);
  const clarificationFields = buildMoveClarificationPendingActionFields(candidates);
  const pendingAction = buildCalendarPendingAction({
    actionType: 'update',
    originalIntent: sourceTranscript,
    eventTitle: 'Медитация',
    sourceTranscript,
    languageCode: 'ru-RU',
    proposedStartMs: Date.parse('2026-05-29T20:00:00-05:00'),
    proposedEndMs: Date.parse('2026-05-29T21:00:00-05:00'),
    updateFromStartISO: extracted.fromStartISO,
    updateToStartISO: extracted.toStartISO,
    ...clarificationFields,
  });

  transitionCalendarConversationState({
    toState: 'WAITING_EVENT_SELECTION',
    pendingAction,
    reason: 'test_move_clarification',
  });
}

describe('calendar move clarification flow', () => {
  it('resolves shorthand time replies against stored candidates', () => {
    for (const reply of ['сегодня в 8', '8 вечера', 'Сегодня в 8 вечера']) {
      const selected = resolveDisambiguationSelection({
        reply,
        candidates,
        referenceNow,
        timeZone,
        locale: 'ru',
        pendingTitle: 'медитация',
      });

      assert.equal(selected?.eventId, 'med-8pm', `reply=${reply}`);
    }
  });

  it('resolves ordinal and numbered replies', () => {
    assert.equal(
      resolveDisambiguationSelection({
        reply: '1',
        candidates,
        referenceNow,
        timeZone,
      })?.eventId,
      'med-8pm',
    );
    assert.equal(
      resolveDisambiguationSelection({
        reply: 'первый',
        candidates,
        referenceNow,
        timeZone,
        locale: 'ru',
      })?.eventId,
      'med-8pm',
    );
    assert.equal(
      resolveDisambiguationSelection({
        reply: 'первая медитация',
        candidates,
        referenceNow,
        timeZone,
        locale: 'ru',
        pendingTitle: 'медитация',
      })?.eventId,
      'med-8pm',
    );
  });

  it('hydrates pending update context from pendingAction candidates', () => {
    seedMoveClarificationWithoutUpdateContext();

    assert.equal(getPendingCalendarUpdateContext(), null);
    assert.equal(getStoredMoveClarificationCandidates().length, 2);

    const hydrated = ensurePendingUpdateContextHydrated(referenceNow);

    assert.ok(hydrated);
    assert.equal(hydrated!.candidates?.length, 2);
    assert.equal(hydrated!.sourceTranscript, sourceTranscript);
  });

  it('resolves clarification reply without fresh calendar search context', () => {
    seedMoveClarificationWithoutUpdateContext();

    const merged = resolveStoredMoveClarificationReply({
      reply: 'Сегодня в 8 вечера',
      referenceNow,
    });

    assert.ok(merged);
    assert.equal(merged!.selectedEventId, 'med-8pm');
    assert.equal(merged!.context.sourceTranscript, sourceTranscript);
    assert.equal(merged!.readyToExecute, true);
    assert.equal(getPendingCalendarUpdateContext()?.selectedEventId, 'med-8pm');
  });

  it('treats selection replies as disambiguation follow-ups when update context was cleared', () => {
    seedMoveClarificationWithoutUpdateContext();

    assert.equal(isAwaitingEventDisambiguationSelectionReply('8 вечера'), true);
    assert.equal(isNewCalendarCommandMessage('Сегодня в 8 вечера'), false);
  });

  it('resolves English day+time clarification replies for relative moves', () => {
    clearPendingCalendarUpdateIntent();
    resetCalendarConversationState('test_reset');

    const sourceTranscript = 'Move meditation one hour earlier';
    const moveCandidates = [
      {
        eventId: 'med-today',
        title: 'Meditation',
        startsAt: '2026-05-28T23:00:00-05:00',
        endsAt: '2026-05-29T00:00:00-05:00',
      },
      {
        eventId: 'med-tomorrow',
        title: 'Meditation',
        startsAt: '2026-05-29T22:00:00-05:00',
        endsAt: '2026-05-29T23:00:00-05:00',
      },
    ];
    const extracted = extractCalendarUpdateParameters(sourceTranscript, referenceNow);
    const clarificationFields = buildMoveClarificationPendingActionFields(moveCandidates);
    const pendingAction = buildCalendarPendingAction({
      actionType: 'update',
      originalIntent: sourceTranscript,
      eventTitle: 'Meditation',
      sourceTranscript,
      languageCode: 'en-US',
      proposedStartMs: Date.parse('2026-05-29T21:00:00-05:00'),
      proposedEndMs: Date.parse('2026-05-29T22:00:00-05:00'),
      updateFromStartISO: extracted.fromStartISO,
      updateToStartISO: extracted.toStartISO,
      ...clarificationFields,
    });

    transitionCalendarConversationState({
      toState: 'WAITING_EVENT_SELECTION',
      pendingAction,
      reason: 'test_en_relative_move_clarification',
    });

    for (const reply of ['Tomorrow 22:00', 'tomorrow', 'second', '2']) {
      assert.equal(
        isAwaitingEventDisambiguationSelectionReply(reply, referenceNow),
        true,
        `selection reply=${reply}`,
      );
      assert.equal(
        isCalendarReadOnlyQuery(reply, referenceNow),
        false,
        `read-only bypass reply=${reply}`,
      );
    }

    const merged = resolveStoredMoveClarificationReply({
      reply: 'Tomorrow 22:00',
      referenceNow,
    });

    assert.equal(merged?.selectedEventId, 'med-tomorrow');
    assert.equal(merged?.readyToExecute, true);
    assert.equal(
      Date.parse(merged!.context.toStartISO!),
      Date.parse('2026-05-29T21:00:00-05:00'),
    );
  });

  it('merges pending move target after candidate pick from stored pendingAction', () => {
    const extracted = extractCalendarUpdateParameters(sourceTranscript, referenceNow);
    const pending = pendingContextFromExtraction({
      sourceTranscript,
      extraction: extracted,
      candidates,
      referenceNow,
    });

    const merged = tryMergePendingCalendarUpdateReply({
      pending,
      reply: '8 вечера',
      referenceNow,
    });

    assert.equal(merged?.selectedEventId, 'med-8pm');
    assert.equal(
      Date.parse(merged!.context.toStartISO!),
      Date.parse('2026-05-29T20:00:00-05:00'),
    );
  });
});
