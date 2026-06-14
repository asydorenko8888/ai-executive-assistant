import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import {
  buildCreateDuplicateTitleConfirmationReply,
} from '@/src/features/agent/calendar/calendarConflictReplies';
import {
  buildCalendarPendingAction,
  getCalendarConversationSnapshot,
  resetCalendarConversationState,
  transitionCalendarConversationState,
} from '@/src/features/agent/calendar/calendarConversationState';
import {
  evaluateDuplicateTitleConfirmation,
} from '@/src/features/agent/calendar/calendarDuplicateTitleEvaluation';
import { parseCalendarCreateSchedule } from '@/src/features/agent/calendar/calendarCreateScheduleParser';
import { extractCreateEventTitle } from '@/src/features/agent/calendar/calendarCreateIntentExtractor';
import { assessCalendarCreateReadiness } from '@/src/features/agent/calendar/calendarAmbiguousCommandSafety';
import { classifyPendingCalendarReply } from '@/src/features/agent/calendar/calendarPendingReplyClassifier';
import { resolvePendingConflictResolution } from '@/src/features/agent/calendar/calendarPendingConflictResolution';
import { extractCalendarCommand, isCalendarExtractionExecutable } from '@/src/features/agent/calendar/calendarCommandExtractor';
import type { CalendarEvent } from '@/src/entities/calendar/types';

const referenceNow = new Date('2026-05-28T20:00:00-05:00');
const timeZone = 'America/Chicago';

function meditationTomorrow22(): CalendarEvent {
  return {
    id: 'meditation-22',
    title: 'Медитация',
    startsAt: '2026-05-29T22:00:00-05:00',
    endsAt: '2026-05-29T23:00:00-05:00',
    isAllDay: false,
    isCancelled: false,
    location: null,
    htmlLink: null,
  };
}

describe('calendar create duplicate confirmation', () => {
  beforeEach(() => {
    resetCalendarConversationState('test_reset');
  });

  it('parses "час дня" as 13:00 for create schedule', () => {
    const transcript = 'Добавь медитацию завтра час дня';
    const schedule = parseCalendarCreateSchedule(transcript, referenceNow, timeZone);

    assert.equal(schedule.ok, true);

    if (schedule.ok) {
      const start = new Date(schedule.startMs);
      assert.equal(start.toISOString(), '2026-05-29T18:00:00.000Z');
    }
  });

  it('existing tomorrow Медитация 22:00 + create at noon asks duplicate confirmation for 13:00', () => {
    const proposedStartMs = Date.parse('2026-05-29T13:00:00-05:00');
    const evaluation = evaluateDuplicateTitleConfirmation({
      events: [meditationTomorrow22()],
      proposedTitle: 'Медитация',
      proposedStartMs,
      referenceNow,
      timeZone,
    });

    assert.equal(evaluation.shouldConfirm, true);
    assert.equal(evaluation.exactDuplicate, false);

    const reply = buildCreateDuplicateTitleConfirmationReply({
      locale: 'ru',
      dayOffset: 1,
      existingTitle: 'Медитация',
      existingStartMs: Date.parse('2026-05-29T22:00:00-05:00'),
      proposedTitle: 'Медитация',
      proposedStartMs,
      exactDuplicate: false,
    });

    assert.match(reply, /Медитация/);
    assert.match(reply, /(?:22:00|10:00 PM)/);
    assert.match(reply, /(?:13:00|01:00 PM)/);
    assert.match(reply, /Создать ещё одну/);
    assert.doesNotMatch(reply, /уточни/i);
  });

  it('user says "да" resolves to execute_original for duplicate confirmation pending action', () => {
    const pending = buildCalendarPendingAction({
      actionType: 'create',
      originalIntent: 'Добавь медитацию завтра час дня',
      eventTitle: 'Медитация',
      sourceTranscript: 'Добавь медитацию завтра час дня',
      languageCode: 'ru-RU',
      proposedStartMs: Date.parse('2026-05-29T13:00:00-05:00'),
      proposedEndMs: Date.parse('2026-05-29T14:00:00-05:00'),
      clarificationKind: 'create_duplicate_confirmation',
    });

    transitionCalendarConversationState({
      toState: 'WAITING_CONFLICT_DECISION',
      pendingAction: pending,
      reason: 'test_duplicate',
    });

    const classification = classifyPendingCalendarReply('да');
    assert.equal(classification, 'confirmation');

    const resolution = resolvePendingConflictResolution({
      pending: pending!,
      transcript: 'да',
      classification,
      referenceNow,
    });

    assert.equal(resolution.kind, 'execute_original');
    if (resolution.kind === 'execute_original') {
      assert.equal(resolution.skipScheduleConflictCheck, true);
    }
  });

  it('existing tomorrow Медитация 22:00 + dinner create does not require duplicate confirmation', () => {
    const proposedStartMs = Date.parse('2026-05-29T19:00:00-05:00');
    const evaluation = evaluateDuplicateTitleConfirmation({
      events: [meditationTomorrow22()],
      proposedTitle: 'Ужин',
      proposedStartMs,
      referenceNow,
      timeZone,
    });

    assert.equal(evaluation.shouldConfirm, false);

    const schedule = parseCalendarCreateSchedule(
      'Добавь ужин завтра в 7 вечера',
      referenceNow,
      timeZone,
    );

    assert.equal(schedule.ok, true);

    if (schedule.ok) {
      const start = new Date(schedule.startMs);
      assert.equal(start.toISOString(), '2026-05-30T00:00:00.000Z');
    }
  });

  it('parsed create with title and time never returns generic title/time clarification', () => {
    const transcript = 'Добавь медитацию завтра час дня';
    const readiness = assessCalendarCreateReadiness({ transcript, referenceNow });
    const extraction = extractCalendarCommand({ transcript, referenceNow });
    const title = extractCreateEventTitle(transcript);

    assert.equal(readiness.ready, true);
    assert.equal(isCalendarExtractionExecutable(extraction), true);
    assert.ok(title);
    assert.equal(title!.length >= 2, true);
    assert.equal(readiness.ambiguityReason, null);
  });

  it('exact duplicate title and time asks exact-duplicate confirmation', () => {
    const proposedStartMs = Date.parse('2026-05-29T22:00:00-05:00');
    const evaluation = evaluateDuplicateTitleConfirmation({
      events: [meditationTomorrow22()],
      proposedTitle: 'Медитация',
      proposedStartMs,
      referenceNow,
      timeZone,
    });

    assert.equal(evaluation.shouldConfirm, true);
    assert.equal(evaluation.exactDuplicate, true);

    const reply = buildCreateDuplicateTitleConfirmationReply({
      locale: 'ru',
      dayOffset: 1,
      existingTitle: 'Медитация',
      existingStartMs: proposedStartMs,
      proposedTitle: 'Медитация',
      proposedStartMs,
      exactDuplicate: true,
    });

    assert.equal(reply, 'Такое событие уже есть. Создать дубль?');
  });

  it('stores create_duplicate_confirmation pending action in conversation state', () => {
    const pending = buildCalendarPendingAction({
      actionType: 'create',
      originalIntent: 'Добавь медитацию завтра час дня',
      eventTitle: 'Медитация',
      sourceTranscript: 'Добавь медитацию завтра час дня',
      languageCode: 'ru-RU',
      proposedStartMs: Date.parse('2026-05-29T13:00:00-05:00'),
      proposedEndMs: Date.parse('2026-05-29T14:00:00-05:00'),
      clarificationKind: 'create_duplicate_confirmation',
    });

    transitionCalendarConversationState({
      toState: 'WAITING_CONFLICT_DECISION',
      pendingAction: pending,
      reason: 'test_duplicate',
    });

    const snapshot = getCalendarConversationSnapshot();
    assert.equal(snapshot.state, 'WAITING_CONFLICT_DECISION');
    assert.equal(snapshot.pendingAction?.clarificationKind, 'create_duplicate_confirmation');
    assert.equal(snapshot.pendingAction?.eventTitle, 'Медитация');
  });

  it('user says "нет" resolves to cancel for duplicate confirmation pending action', () => {
    const pending = buildCalendarPendingAction({
      actionType: 'create',
      originalIntent: 'Добавь медитацию завтра час дня',
      eventTitle: 'Медитация',
      sourceTranscript: 'Добавь медитацию завтра час дня',
      languageCode: 'ru-RU',
      proposedStartMs: Date.parse('2026-05-29T13:00:00-05:00'),
      proposedEndMs: Date.parse('2026-05-29T14:00:00-05:00'),
      clarificationKind: 'create_duplicate_confirmation',
    });

    transitionCalendarConversationState({
      toState: 'WAITING_CONFLICT_DECISION',
      pendingAction: pending,
      reason: 'test_duplicate',
    });

    const resolution = resolvePendingConflictResolution({
      pending,
      transcript: 'нет',
      classification: classifyPendingCalendarReply('нет'),
      referenceNow,
    });

    assert.equal(resolution.kind, 'cancel');
  });
});
