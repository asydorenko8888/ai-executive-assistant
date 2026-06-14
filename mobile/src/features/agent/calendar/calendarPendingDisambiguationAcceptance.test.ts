import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { tryMergePendingCalendarDeleteReply } from '@/src/features/agent/calendar/calendarDeletePendingContext';
import { resolveDisambiguationSelection } from '@/src/features/agent/calendar/calendarEventDisambiguation';
import {
  buildMoveClarificationPendingActionFields,
  resolveStoredMoveClarificationReply,
} from '@/src/features/agent/calendar/calendarMoveClarificationState';
import { isAwaitingEventDisambiguationSelectionReply } from '@/src/features/agent/calendar/calendarPendingReplyClassifier';
import { isCalendarReadOnlyQuery } from '@/src/features/agent/calendar/calendarReadOnlyQuery';
import { requiresCalendarCommandExecution } from '@/src/features/agent/calendar/calendarCommandTypes';
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
import { mergeActionContextFromHistory } from '@/src/features/agent/intent/actionContextMerge';
import {
  clearPendingCalendarDeleteIntent,
  clearPendingCalendarUpdateIntent,
  getPendingCalendarDeleteContext,
  setPendingCalendarDeleteContext,
} from '@/src/features/agent/execution/calendarExecutionSession';

const referenceNow = new Date('2026-05-28T20:00:00-05:00');
const timeZone = 'America/Chicago';
const selectionReply = 'Завтра 10 вечера';

const meditationCandidates = [
  {
    eventId: 'med-today-22',
    title: 'Медитация',
    startsAt: '2026-05-28T22:00:00-05:00',
    endsAt: '2026-05-28T23:00:00-05:00',
  },
  {
    eventId: 'med-tomorrow-21',
    title: 'Медитация',
    startsAt: '2026-05-29T21:00:00-05:00',
    endsAt: '2026-05-29T22:00:00-05:00',
  },
  {
    eventId: 'med-tomorrow-22',
    title: 'Медитация',
    startsAt: '2026-05-29T22:00:00-05:00',
    endsAt: '2026-05-29T23:00:00-05:00',
  },
];

function pendingDelete() {
  return {
    operation: 'delete' as const,
    type: 'delete' as const,
    title: 'медитацию',
    dayHint: null,
    sourceTranscript: 'Удали медитацию',
    originalUserText: 'Удали медитацию',
    createdAtMs: Date.now(),
    candidates: meditationCandidates,
  };
}

function seedDeleteClarification() {
  clearPendingCalendarDeleteIntent();
  clearPendingCalendarUpdateIntent();
  resetCalendarConversationState('test_reset');

  const pending = pendingDelete();
  setPendingCalendarDeleteContext(pending);

  transitionCalendarConversationState({
    toState: 'WAITING_EVENT_SELECTION',
    pendingAction: buildCalendarPendingAction({
      actionType: 'delete',
      originalIntent: pending.sourceTranscript,
      eventTitle: pending.title,
      sourceTranscript: pending.sourceTranscript,
      languageCode: 'ru-RU',
      proposedStartMs: Date.parse('2026-05-28T22:00:00-05:00'),
      proposedEndMs: Date.parse('2026-05-28T23:00:00-05:00'),
      ...buildMoveClarificationPendingActionFields(meditationCandidates),
      clarificationKind: 'delete_event',
    }),
    reason: 'test_delete_meditation_clarification',
  });

  return pending;
}

function seedMoveClarification() {
  clearPendingCalendarDeleteIntent();
  clearPendingCalendarUpdateIntent();
  resetCalendarConversationState('test_reset');

  const sourceTranscript = 'Перенеси медитацию на завтра';
  const extracted = extractCalendarUpdateParameters(sourceTranscript, referenceNow);
  const pending = pendingContextFromExtraction({
    sourceTranscript,
    extraction: extracted,
    candidates: meditationCandidates,
    referenceNow,
  });

  transitionCalendarConversationState({
    toState: 'WAITING_EVENT_SELECTION',
    pendingAction: buildCalendarPendingAction({
      actionType: 'update',
      originalIntent: sourceTranscript,
      eventTitle: 'Медитация',
      sourceTranscript,
      languageCode: 'ru-RU',
      proposedStartMs: Date.parse('2026-05-29T22:00:00-05:00'),
      proposedEndMs: Date.parse('2026-05-29T23:00:00-05:00'),
      updateFromStartISO: extracted.fromStartISO,
      updateToStartISO: extracted.toStartISO,
      ...buildMoveClarificationPendingActionFields(meditationCandidates),
      clarificationKind: 'move_event',
    }),
    reason: 'test_move_meditation_clarification',
  });

  return pending;
}

describe('calendar pending disambiguation acceptance', () => {
  beforeEach(() => {
    resetCalendarConversationState('test_reset');
    clearPendingCalendarDeleteIntent();
    clearPendingCalendarUpdateIntent();
  });

  it('delete ambiguous meditation: Завтра 10 вечера selects tomorrow 22:00 candidate', () => {
    seedDeleteClarification();

    const selected = resolveDisambiguationSelection({
      reply: selectionReply,
      candidates: meditationCandidates,
      referenceNow,
      timeZone,
      locale: 'ru',
      pendingTitle: 'медитация',
    });

    assert.equal(selected?.eventId, 'med-tomorrow-22');

    const merged = tryMergePendingCalendarDeleteReply({
      pending: pendingDelete(),
      reply: selectionReply,
      referenceNow,
      timeZone,
    });

    assert.equal(merged?.selectedEventId, 'med-tomorrow-22');
  });

  it('delete clarification reply routes to pending action instead of read-only agenda', () => {
    seedDeleteClarification();

    assert.equal(isAwaitingEventDisambiguationSelectionReply(selectionReply, referenceNow), true);
    assert.equal(isCalendarReadOnlyQuery(selectionReply, referenceNow), false);
    assert.equal(requiresCalendarCommandExecution(selectionReply), true);

    const merged = mergeActionContextFromHistory({
      transcript: selectionReply,
      messages: [],
      referenceNow,
    });

    assert.equal(merged.contextSource, 'pending_delete_clarification');
    assert.equal(getPendingCalendarDeleteContext()?.selectedEventId, 'med-tomorrow-22');
  });

  it('move ambiguous meditation: Завтра 10 вечера selects tomorrow 22:00 candidate', () => {
    const pending = seedMoveClarification();

    const selected = resolveDisambiguationSelection({
      reply: selectionReply,
      candidates: meditationCandidates,
      referenceNow,
      timeZone,
      locale: 'ru',
      pendingTitle: 'медитация',
    });

    assert.equal(selected?.eventId, 'med-tomorrow-22');

    const merged = tryMergePendingCalendarUpdateReply({
      pending,
      reply: selectionReply,
      referenceNow,
    });

    assert.equal(merged?.selectedEventId, 'med-tomorrow-22');
    assert.equal(merged?.readyToExecute, true);
  });

  it('move clarification reply is not treated as a new list_day intent', () => {
    seedMoveClarification();

    assert.equal(isAwaitingEventDisambiguationSelectionReply(selectionReply, referenceNow), true);
    assert.equal(isCalendarReadOnlyQuery(selectionReply, referenceNow), false);
    assert.equal(requiresCalendarCommandExecution(selectionReply), true);

    const merged = resolveStoredMoveClarificationReply({
      reply: selectionReply,
      referenceNow,
    });

    assert.equal(merged?.selectedEventId, 'med-tomorrow-22');
  });

  it('update ambiguous meditation: Завтра 10 вечера selects tomorrow 22:00 candidate', () => {
    const sourceTranscript = 'Измени медитацию на завтра в 10 вечера';
    const extracted = extractCalendarUpdateParameters(sourceTranscript, referenceNow);
    const pending = pendingContextFromExtraction({
      sourceTranscript,
      extraction: extracted,
      candidates: meditationCandidates,
      referenceNow,
    });

    const selected = resolveDisambiguationSelection({
      reply: selectionReply,
      candidates: meditationCandidates,
      referenceNow,
      timeZone,
      locale: 'ru',
      pendingTitle: 'медитация',
    });

    assert.equal(selected?.eventId, 'med-tomorrow-22');

    const merged = tryMergePendingCalendarUpdateReply({
      pending,
      reply: selectionReply,
      referenceNow,
    });

    assert.equal(merged?.selectedEventId, 'med-tomorrow-22');
  });

  it('supports ordinal and numbered selection replies', () => {
    assert.equal(
      resolveDisambiguationSelection({
        reply: 'номер 2',
        candidates: meditationCandidates,
        referenceNow,
        timeZone,
      })?.eventId,
      'med-tomorrow-21',
    );
    assert.equal(
      resolveDisambiguationSelection({
        reply: 'второй',
        candidates: meditationCandidates,
        referenceNow,
        timeZone,
        locale: 'ru',
      })?.eventId,
      'med-tomorrow-21',
    );
    assert.equal(
      resolveDisambiguationSelection({
        reply: 'третий',
        candidates: meditationCandidates,
        referenceNow,
        timeZone,
        locale: 'ru',
      })?.eventId,
      'med-tomorrow-22',
    );
    assert.equal(
      resolveDisambiguationSelection({
        reply: 'сегодня 9 вечера',
        candidates: meditationCandidates,
        referenceNow,
        timeZone,
        locale: 'ru',
        pendingTitle: 'медитация',
      })?.eventId,
      'med-today-22',
    );
  });
});
