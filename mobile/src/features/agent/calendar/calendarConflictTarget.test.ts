import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import {
  buildCalendarUpdateConflictInitialReply,
} from '@/src/features/agent/calendar/calendarConflictReplies';
import { pendingConflictContextFromCheck } from '@/src/features/agent/calendar/calendarConflictPendingContext';
import {
  getConversationEventMemory,
  recordCreatedConversationEvent,
  resetConversationEventMemory,
  setPendingEventFromAction,
} from '@/src/features/agent/calendar/calendarConversationEventMemory';
import { resetCalendarConversationState } from '@/src/features/agent/calendar/calendarConversationState';
import { conflictContextToPendingAction } from '@/src/features/agent/calendar/calendarConversationSync';
import { classifyPendingCalendarReply } from '@/src/features/agent/calendar/calendarPendingReplyClassifier';
import { resolvePendingConflictResolution } from '@/src/features/agent/calendar/calendarPendingConflictResolution';
import { resolveStoredUpdateTargetFromPending } from '@/src/features/agent/calendar/calendarPendingConflictTarget';
import { buildCalendarUpdatePayloadFromStoredTarget } from '@/src/features/agent/execution/calendarUpdatePayloadBuilder';

const referenceNow = new Date('2026-05-28T12:00:00-05:00');
const meditationStart = '2026-05-28T13:00:00-05:00';
const meditationEnd = '2026-05-28T14:00:00-05:00';
const dentistStart = '2026-05-28T15:00:00-05:00';
const dentistEnd = '2026-05-28T16:00:00-05:00';
const dentistTargetStartMs = Date.parse('2026-05-28T13:00:00-05:00');
const dentistTargetEndMs = Date.parse('2026-05-28T14:00:00-05:00');

function buildDentistMoveConflictPending() {
  const context = pendingConflictContextFromCheck({
    operation: 'update',
    sourceTranscript: 'Move it 2 hours earlier',
    languageCode: 'en-US',
    proposedTitle: 'Dentist',
    proposedStartMs: dentistTargetStartMs,
    proposedEndMs: dentistTargetEndMs,
    updateEventId: 'dentist',
    targetOriginalStartsAt: dentistStart,
    targetOriginalEndsAt: dentistEnd,
    conflictingEventId: 'meditation',
    conflictingTitle: 'Meditation',
    conflictingStartsAt: meditationStart,
    conflictingEndsAt: meditationEnd,
  });

  return conflictContextToPendingAction(context, [
    {
      event: {
        id: 'meditation',
        title: 'Meditation',
        startsAt: meditationStart,
        endsAt: meditationEnd,
      },
    },
  ]);
}

describe('conflict confirmation target', () => {
  beforeEach(() => {
    resetCalendarConversationState('test_reset');
    resetConversationEventMemory('test_reset');
  });

  it('stores dentist as the move target when moving into meditation slot', () => {
    const pending = buildDentistMoveConflictPending();
    const stored = resolveStoredUpdateTargetFromPending(pending);

    assert.equal(stored?.eventId, 'dentist');
    assert.equal(stored?.title, 'Dentist');
    assert.equal(stored?.originalStartsAt, dentistStart);
    assert.equal(stored?.originalEndsAt, dentistEnd);
    assert.equal(stored?.requestedStartMs, dentistTargetStartMs);
    assert.equal(pending.conflictingEventId, 'meditation');
    assert.equal(pending.conflictingEventTitle, 'Meditation');
  });

  it('builds update payload for dentist to 13:00 without re-resolving pronouns', () => {
    const pending = buildDentistMoveConflictPending();
    const stored = resolveStoredUpdateTargetFromPending(pending);

    assert.ok(stored);

    const payload = buildCalendarUpdatePayloadFromStoredTarget({
      eventId: stored.eventId,
      title: stored.title,
      originalStartsAt: stored.originalStartsAt,
      originalEndsAt: stored.originalEndsAt,
      requestedStartMs: stored.requestedStartMs,
      requestedEndMs: stored.requestedEndMs,
      languageCode: 'en-US',
    });

    assert.equal(payload.ok, true);

    if (payload.ok) {
      assert.equal(payload.eventId, 'dentist');
      assert.equal(payload.matchedEvent.title, 'Dentist');
      assert.equal(payload.toMs, dentistTargetStartMs);
      assert.match(payload.payload.start.dateTime ?? '', /T13:00:00/);
    }
  });

  it('keeps pending memory on the target original time, not the requested slot', () => {
    recordCreatedConversationEvent({
      eventId: 'meditation',
      title: 'Meditation',
      startISO: meditationStart,
      endISO: meditationEnd,
    });

    recordCreatedConversationEvent({
      eventId: 'dentist',
      title: 'Dentist',
      startISO: dentistStart,
      endISO: dentistEnd,
    });

    const pending = buildDentistMoveConflictPending();
    setPendingEventFromAction(pending);

    const memory = getConversationEventMemory();

    assert.equal(memory.pendingEvent?.eventId, 'dentist');
    assert.equal(memory.pendingEvent?.title, 'Dentist');
    assert.equal(memory.lastReferencedEvent?.eventId, 'dentist');
    assert.equal(memory.lastReferencedEvent?.startISO, dentistStart);
  });

  it('asks for confirmation when moving dentist into meditation slot', () => {
    const reply = buildCalendarUpdateConflictInitialReply({
      locale: 'ru',
      proposedTitle: 'Dentist',
      conflict: {
        event: {
          id: 'meditation',
          title: 'Meditation',
          startsAt: meditationStart,
          endsAt: meditationEnd,
          isAllDay: false,
        },
        startsAtMs: Date.parse(meditationStart),
        endsAtMs: Date.parse(meditationEnd),
      },
      proposedStartMs: dentistTargetStartMs,
      proposedEndMs: dentistTargetEndMs,
    });

    assert.match(reply, /Meditation/i);
    assert.match(reply, /Dentist/i);
    assert.match(reply, /Перенести «Dentist»/i);
    assert.match(reply, /всё равно/i);
    assert.doesNotMatch(reply, /Не переношу/i);
  });

  it('treats repeating the requested time as confirmation for walk move into dentist slot', () => {
    const walkStartMs = Date.parse('2026-05-28T19:00:00-05:00');
    const walkEndMs = Date.parse('2026-05-28T20:00:00-05:00');
    const targetStartMs = Date.parse('2026-05-28T17:00:00-05:00');
    const targetEndMs = Date.parse('2026-05-28T18:00:00-05:00');

    const pending = conflictContextToPendingAction(
      pendingConflictContextFromCheck({
        operation: 'update',
        sourceTranscript: 'Move Walk 2 hours earlier',
        languageCode: 'en-US',
        proposedTitle: 'Walk',
        proposedStartMs: targetStartMs,
        proposedEndMs: targetEndMs,
        updateEventId: 'walk',
        targetOriginalStartsAt: new Date(walkStartMs).toISOString(),
        targetOriginalEndsAt: new Date(walkEndMs).toISOString(),
        conflictingEventId: 'dentist',
        conflictingTitle: 'Dentist',
        conflictingStartsAt: new Date(targetStartMs).toISOString(),
        conflictingEndsAt: new Date(targetEndMs).toISOString(),
      }),
    );

    const reply = buildCalendarUpdateConflictInitialReply({
      locale: 'en',
      proposedTitle: 'Walk',
      conflict: {
        event: {
          id: 'dentist',
          title: 'Dentist',
          startsAt: new Date(targetStartMs).toISOString(),
          endsAt: new Date(targetEndMs).toISOString(),
          isAllDay: false,
        },
        startsAtMs: targetStartMs,
        endsAtMs: targetEndMs,
      },
      proposedStartMs: targetStartMs,
      proposedEndMs: targetEndMs,
    });

    assert.match(reply, /At .* you already have: Dentist/i);
    assert.match(reply, /Move Walk to .* anyway/i);

    const resolution = resolvePendingConflictResolution({
      pending,
      transcript: 'today 5:00 PM',
      classification: classifyPendingCalendarReply('today 5:00 PM'),
      referenceNow: new Date('2026-05-28T12:00:00-05:00'),
    });

    assert.equal(resolution.kind, 'execute_original');

    if (resolution.kind === 'execute_original') {
      assert.equal(resolution.skipScheduleConflictCheck, true);
    }
  });
});
