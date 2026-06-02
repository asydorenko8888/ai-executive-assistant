import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import {
  buildCalendarPendingAction,
  getCalendarConversationSnapshot,
  resetCalendarConversationState,
  transitionCalendarConversationState,
} from '@/src/features/agent/calendar/calendarConversationState';
import { classifyPendingCalendarReply } from '@/src/features/agent/calendar/calendarPendingReplyClassifier';
import { normalizeCalendarEventTitle } from '@/src/features/agent/calendar/calendarEventTitleNormalization';
import {
  buildConflictFollowUpTranscript,
  resolvePendingConflictResolution,
} from '@/src/features/agent/calendar/calendarPendingConflictResolution';
import {
  enrichTranscriptForActivePendingConflict,
  isExplicitDifferentCalendarCommand,
} from '@/src/features/agent/calendar/calendarPendingConflictEnrichment';
import { isNewCalendarCommandMessage } from '@/src/features/agent/calendar/calendarPendingReplyClassifier';
import { enrichCalendarCommandTranscript } from '@/src/features/agent/calendar/calendarTranscriptEnrichment';
import { parseCalendarCreateSchedule } from '@/src/features/agent/calendar/calendarCreateScheduleParser';
import { parseClockFragmentToMinutes } from '@/src/features/agent/calendarIntelligence/calendarClockParser';

const referenceNow = new Date('2026-06-01T10:00:00-05:00');
const conflictStartMs = Date.parse('2026-06-01T20:00:00-05:00');
const conflictEndMs = Date.parse('2026-06-01T21:00:00-05:00');

function buildNegotiationsPending() {
  return buildCalendarPendingAction({
    actionType: 'create',
    originalIntent: 'Добавь переговоры сегодня на 4 вечера',
    eventTitle: 'Переговоры',
    sourceTranscript: 'Добавь переговоры сегодня на 4 вечера',
    titleSourceTranscript: 'Добавь переговоры сегодня на 4 вечера',
    languageCode: 'ru-RU',
    proposedStartMs: conflictStartMs,
    proposedEndMs: conflictEndMs,
    alternativeStartMs: [
      Date.parse('2026-06-01T19:00:00-05:00'),
      Date.parse('2026-06-01T21:00:00-05:00'),
    ],
    conflictEvents: [
      {
        eventId: 'pool',
        title: 'Бассейн',
        startsAt: '2026-06-01T20:00:00-05:00',
        endsAt: '2026-06-01T21:00:00-05:00',
      },
    ],
  });
}

function buildWalkPending() {
  return buildCalendarPendingAction({
    actionType: 'create',
    originalIntent: 'Добавь прогулку на 8 вечера',
    eventTitle: 'Прогулка',
    sourceTranscript: 'Добавь прогулку на 8 вечера',
    titleSourceTranscript: 'Добавь прогулку на 8 вечера',
    languageCode: 'ru-RU',
    proposedStartMs: conflictStartMs,
    proposedEndMs: conflictEndMs,
    alternativeStartMs: [
      Date.parse('2026-06-01T19:00:00-05:00'),
      Date.parse('2026-06-01T21:00:00-05:00'),
    ],
    conflictEvents: [
      {
        eventId: 'gym',
        title: 'Спортзал',
        startsAt: '2026-06-01T20:00:00-05:00',
        endsAt: '2026-06-01T21:00:00-05:00',
      },
    ],
  });
}

function setupConflictPending() {
  transitionCalendarConversationState({
    toState: 'WAITING_CONFLICT_RESOLUTION',
    pendingAction: buildWalkPending(),
    reason: 'test_conflict',
  });
}

function resolveWithReply(reply: string, pending = buildWalkPending()) {
  return resolvePendingConflictResolution({
    pending,
    transcript: reply,
    classification: classifyPendingCalendarReply(reply),
    referenceNow,
  });
}

describe('pending conflict resolution', () => {
  beforeEach(() => {
    resetCalendarConversationState('test_reset');
  });

  it('classifies yes, no, time, and suggest replies', () => {
    assert.equal(classifyPendingCalendarReply('да'), 'confirmation');
    assert.equal(classifyPendingCalendarReply('нет'), 'decline_proceed');
    assert.equal(classifyPendingCalendarReply('21:00'), 'alternate_time');
    assert.equal(classifyPendingCalendarReply('сегодня на 5 вечера'), 'alternate_time');
    assert.equal(classifyPendingCalendarReply('завтра 16:00'), 'alternate_time');
    assert.equal(classifyPendingCalendarReply('9 вечера'), 'alternate_time');
    assert.equal(classifyPendingCalendarReply('предложи другое время'), 'alternate_time');
  });

  it('resolves да as execute original at requested time', () => {
    const resolution = resolveWithReply('да');

    assert.equal(resolution.kind, 'execute_original');

    if (resolution.kind === 'execute_original') {
      assert.equal(resolution.skipScheduleConflictCheck, true);
    }
  });

  it('resolves нет as suggest alternatives (not cancel)', () => {
    assert.equal(resolveWithReply('нет').kind, 'suggest_alternatives');
  });

  it('resolves 21:00 as execute with new time preserving title', () => {
    const resolution = resolveWithReply('21:00');

    assert.equal(resolution.kind, 'execute_with_schedule');

    if (resolution.kind === 'execute_with_schedule') {
      const minutes = (resolution.startMs - referenceNow.getTime()) / 60_000;
      assert.ok(minutes > 0);
    }

    const transcript = buildConflictFollowUpTranscript(buildWalkPending(), '21:00');
    assert.match(transcript, /прогулк/i);
  });

  it('resolves сегодня на 5 вечера with pending title Переговоры', () => {
    const pending = buildNegotiationsPending();
    const resolution = resolveWithReply('сегодня на 5 вечера', pending);

    assert.equal(resolution.kind, 'execute_with_schedule');

    if (resolution.kind === 'execute_with_schedule') {
      const transcript = buildConflictFollowUpTranscript(pending, 'сегодня на 5 вечера');
      assert.match(transcript, /переговор/i);
      const schedule = parseCalendarCreateSchedule(transcript, referenceNow);
      assert.equal(schedule.ok, true);

      if (schedule.ok) {
        const minutes = parseClockFragmentToMinutes('17:00', transcript);
        assert.equal(minutes, 17 * 60);
      }
    }
  });

  it('resolves завтра с 4 до 5 as explicit range 16:00–17:00', () => {
    const pending = buildNegotiationsPending();
    const resolution = resolveWithReply('завтра с 4 до 5', pending);

    assert.equal(resolution.kind, 'execute_with_schedule');

    if (resolution.kind === 'execute_with_schedule') {
      assert.equal(resolution.explicitDayOffset, 1);
      const startParts = new Date(resolution.startMs);
      const endParts = new Date(resolution.endMs);
      assert.equal(endParts.getTime() - startParts.getTime(), 60 * 60_000);
    }
  });

  it('enriches conflict time follow-up with pending title', () => {
    transitionCalendarConversationState({
      toState: 'WAITING_CONFLICT_RESOLUTION',
      pendingAction: buildNegotiationsPending(),
      reason: 'test',
    });

    const enriched = enrichCalendarCommandTranscript({
      transcript: 'сегодня на 5 вечера',
      referenceNow,
    });

    assert.match(enriched, /переговор/i);
    assert.doesNotMatch(enriched, /^добавь\s+сегодня/i);
  });

  it('builds follow-up transcript for spoken evening time', () => {
    const transcript = buildConflictFollowUpTranscript(buildWalkPending(), '9 вечера');

    assert.match(transcript, /прогулк/i);
    assert.match(transcript, /9 вечера/i);
  });

  it('resolves suggest another time without treating it as clock reply', () => {
    assert.equal(resolveWithReply('предложи другое время').kind, 'suggest_alternatives');
  });

  it('cancels pending state on отмена', () => {
    setupConflictPending();
    assert.equal(resolveWithReply('отмена').kind, 'cancel');

    resetCalendarConversationState('user_cancelled', 'отмена');

    assert.equal(getCalendarConversationSnapshot().state, 'IDLE');
    assert.equal(getCalendarConversationSnapshot().pendingAction, null);
  });

  it('does not resolve да or 21:00 as remind (no duplicate conflict prompt)', () => {
    setupConflictPending();

    assert.notEqual(resolveWithReply('да').kind, 'remind');
    assert.notEqual(resolveWithReply('21:00').kind, 'remind');
    assert.equal(resolveWithReply('да').kind, 'execute_original');
    assert.equal(resolveWithReply('21:00').kind, 'execute_with_schedule');
  });

  it('stores conflict decision state with title and alternatives', () => {
    setupConflictPending();
    const snapshot = getCalendarConversationSnapshot();

    assert.equal(snapshot.state, 'WAITING_CONFLICT_RESOLUTION');
    assert.equal(snapshot.pendingAction?.eventTitle, 'Прогулка');
    assert.equal(snapshot.pendingAction?.alternativeStartMs?.length, 2);
    assert.equal(snapshot.pendingAction?.requestedStartMs, conflictStartMs);
  });

  it('normalizes accusative event titles', () => {
    assert.equal(normalizeCalendarEventTitle('стоматолога'), 'Стоматолог');
    assert.equal(normalizeCalendarEventTitle('тренировку'), 'Тренировка');
  });

  it('keeps pending conflict context for title and pronoun follow-ups', () => {
    const pending = buildNegotiationsPending();

    transitionCalendarConversationState({
      toState: 'WAITING_CONFLICT_RESOLUTION',
      pendingAction: pending,
      reason: 'test_alternatives',
    });

    assert.equal(isNewCalendarCommandMessage('переговоры завтра'), false);
    assert.equal(isNewCalendarCommandMessage('Добавь переговоры на 5 вечера'), false);
    assert.equal(isExplicitDifferentCalendarCommand('Добавь стоматолога завтра', pending), true);
    assert.equal(isNewCalendarCommandMessage('Добавь стоматолога завтра'), true);

    const enriched = enrichTranscriptForActivePendingConflict('их на 5 вечера', pending);
    assert.match(enriched, /переговор/i);
    assert.match(enriched, /5 вечера/i);

    const titleTime = enrichTranscriptForActivePendingConflict('переговоры завтра в 4', pending);
    assert.match(titleTime, /переговор/i);
    assert.match(titleTime, /завтра/i);
  });
});
