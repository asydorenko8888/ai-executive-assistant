import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildCalendarPendingAction,
  getCalendarConversationSnapshot,
  resetCalendarConversationState,
  transitionCalendarConversationState,
} from '@/src/features/agent/calendar/calendarConversationState';
import { buildMoveClarificationPendingActionFields } from '@/src/features/agent/calendar/calendarMoveClarificationState';
import { tryMergePendingCalendarDeleteReply } from '@/src/features/agent/calendar/calendarDeletePendingContext';
import { buildAuthoritativeDeleteToolResponseCore } from '@/src/features/agent/calendar/calendarAuthoritativeMutationCore';
import { buildCalendarDeleteToolReplyBundle } from '@/src/features/agent/execution/calendarDeleteToolResponses';
import {
  clearPendingCalendarDeleteIntent,
  setPendingCalendarDeleteContext,
} from '@/src/features/agent/execution/calendarExecutionSession';
import type { VerifiedCalendarEvent } from '@/src/features/agent/execution/actionExecutionTypes';
import { createCalendarToolFailure } from '@/src/features/agent/execution/calendarToolContract';

const referenceNow = new Date('2026-05-29T12:00:00-05:00');
const timeZone = 'America/Chicago';

const tomorrowAgenda = [
  {
    eventId: 'massage-4pm',
    title: 'Massage',
    startsAt: '2026-05-30T16:00:00-05:00',
    endsAt: '2026-05-30T17:00:00-05:00',
  },
  {
    eventId: 'dinner-7pm',
    title: 'Dinner',
    startsAt: '2026-05-30T19:00:00-05:00',
    endsAt: '2026-05-30T20:00:00-05:00',
  },
  {
    eventId: 'med-9pm',
    title: 'Meditation',
    startsAt: '2026-05-30T21:00:00-05:00',
    endsAt: '2026-05-30T22:00:00-05:00',
  },
  {
    eventId: 'med-10pm',
    title: 'Meditation',
    startsAt: '2026-05-30T22:00:00-05:00',
    endsAt: '2026-05-30T23:00:00-05:00',
  },
];

function meditationDeleteCandidates() {
  return tomorrowAgenda.filter((event) => event.title === 'Meditation');
}

function verifiedEvent(event: (typeof tomorrowAgenda)[number]): VerifiedCalendarEvent {
  return {
    id: event.eventId,
    summary: event.title,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
  };
}

describe('calendar delete verification acceptance', () => {
  it('A: delete meditation disambiguation selects only tomorrow 22:00 eventId', () => {
    resetCalendarConversationState('test_reset');
    clearPendingCalendarDeleteIntent();

    const candidates = meditationDeleteCandidates();
    const pending = {
      operation: 'delete' as const,
      type: 'delete' as const,
      title: 'медитацию',
      dayHint: null,
      sourceTranscript: 'Удали медитацию',
      originalUserText: 'Удали медитацию',
      createdAtMs: Date.now(),
      candidates,
    };

    setPendingCalendarDeleteContext(pending);
    transitionCalendarConversationState({
      toState: 'WAITING_EVENT_SELECTION',
      pendingAction: buildCalendarPendingAction({
        actionType: 'delete',
        originalIntent: pending.sourceTranscript,
        eventTitle: pending.title ?? 'Meditation',
        sourceTranscript: pending.sourceTranscript,
        languageCode: 'ru-RU',
        proposedStartMs: Date.parse('2026-05-30T21:00:00-05:00'),
        proposedEndMs: Date.parse('2026-05-30T22:00:00-05:00'),
        ...buildMoveClarificationPendingActionFields(candidates),
        clarificationKind: 'delete_event',
      }),
      reason: 'test_delete_meditation_clarification',
    });

    const merged = tryMergePendingCalendarDeleteReply({
      pending,
      reply: 'Завтра 22 вечера',
      referenceNow,
      timeZone,
    });

    assert.equal(merged?.selectedEventId, 'med-10pm');

    const snapshot = getCalendarConversationSnapshot();
    assert.equal(snapshot.pendingAction?.targetEventId, 'med-10pm');
    assert.equal(snapshot.pendingAction?.originalStart, '2026-05-30T22:00:00-05:00');
    assert.equal(snapshot.pendingAction?.eventTitle, 'Meditation');
  });

  it('A2: verified delete success is shown only after verification, then agenda excludes deleted event', async () => {
    const deleted = verifiedEvent(meditationDeleteCandidates()[1]!);

    const tool = await buildAuthoritativeDeleteToolResponseCore({
      eventId: deleted.id,
      backendResponse: {
        executionState: 'success',
        verified: true,
        verificationFetched: true,
        event: {
          id: deleted.id,
          summary: deleted.summary,
          startsAt: deleted.startsAt,
          endsAt: deleted.endsAt,
        },
      },
      deletedEventSnapshot: deleted,
      confirmDeleted: async () => 'confirmed',
    });

    assert.equal(tool.status, 'SUCCESS');
    assert.equal(tool.verified, true);

    const bundle = buildCalendarDeleteToolReplyBundle(tool, 'ru-RU', { referenceNow });
    assert.match(bundle.reply, /Событие удалено:/);

    const remaining = tomorrowAgenda.filter((event) => event.eventId !== deleted.id);
    assert.equal(remaining.some((event) => event.eventId === 'med-10pm'), false);
    assert.equal(remaining.some((event) => event.eventId === 'med-9pm'), true);
    assert.equal(remaining.some((event) => event.eventId === 'dinner-7pm'), true);
  });

  it('B: delete API failure must not claim the event was deleted', () => {
    const tool = createCalendarToolFailure(
      'CALENDAR_API_UNAVAILABLE',
      'Google Calendar API unavailable',
    );
    const bundle = buildCalendarDeleteToolReplyBundle(tool, 'ru-RU', { referenceNow });

    assert.doesNotMatch(bundle.reply, /Событие удалено:/);
    assert.match(bundle.reply, /Не удалось выполнить действие\. Календарь не изменён\./);
    assert.equal(bundle.executionState, 'failed');
  });

  it('C: if event still exists after delete, verification failure is reported', async () => {
    const deleted = verifiedEvent(meditationDeleteCandidates()[1]!);

    const tool = await buildAuthoritativeDeleteToolResponseCore({
      eventId: deleted.id,
      backendResponse: {
        executionState: 'success',
        verified: true,
        verificationFetched: true,
        event: {
          id: deleted.id,
          summary: deleted.summary,
          startsAt: deleted.startsAt,
          endsAt: deleted.endsAt,
        },
      },
      deletedEventSnapshot: deleted,
      confirmDeleted: async () => 'still_present',
    });

    assert.equal(tool.status, 'FAILURE');
    assert.equal(tool.errorCode, 'VERIFY_FAILED');

    const bundle = buildCalendarDeleteToolReplyBundle(tool, 'ru-RU', { referenceNow });
    assert.doesNotMatch(bundle.reply, /Событие удалено:/);
    assert.match(bundle.reply, /Календарь не изменён/);
    assert.match(bundle.reply, /не подтверждено/i);
  });

  it('C2: verification fetch failure must not claim delete success', async () => {
    const deleted = verifiedEvent(meditationDeleteCandidates()[1]!);

    const tool = await buildAuthoritativeDeleteToolResponseCore({
      eventId: deleted.id,
      backendResponse: {
        executionState: 'success',
        verified: true,
        verificationFetched: true,
        event: {
          id: deleted.id,
          summary: deleted.summary,
          startsAt: deleted.startsAt,
          endsAt: deleted.endsAt,
        },
      },
      deletedEventSnapshot: deleted,
      confirmDeleted: async () => 'unavailable',
    });

    assert.equal(tool.status, 'FAILURE');
    assert.equal(tool.errorCode, 'VERIFY_FAILED');

    const bundle = buildCalendarDeleteToolReplyBundle(tool, 'ru-RU', { referenceNow });
    assert.doesNotMatch(bundle.reply, /Событие удалено:/);
    assert.match(bundle.reply, /Календарь не изменён/);
  });

  it('pending delete selection keeps bound eventId across confirmation-style replies', () => {
    resetCalendarConversationState('test_reset');

    transitionCalendarConversationState({
      toState: 'WAITING_EVENT_SELECTION',
      pendingAction: buildCalendarPendingAction({
        actionType: 'delete',
        originalIntent: 'Удали медитацию',
        eventTitle: 'Meditation',
        sourceTranscript: 'Удали медитацию',
        languageCode: 'ru-RU',
        proposedStartMs: Date.parse('2026-05-30T22:00:00-05:00'),
        proposedEndMs: Date.parse('2026-05-30T23:00:00-05:00'),
        targetEventId: 'med-10pm',
        candidateEventId: 'med-10pm',
        originalStart: '2026-05-30T22:00:00-05:00',
        originalEnd: '2026-05-30T23:00:00-05:00',
        clarificationKind: 'delete_event',
      }),
      reason: 'test_bound_delete',
    });

    const snapshot = getCalendarConversationSnapshot();
    assert.equal(snapshot.pendingAction?.targetEventId, 'med-10pm');
    assert.equal(snapshot.pendingAction?.originalStart, '2026-05-30T22:00:00-05:00');
  });
});
