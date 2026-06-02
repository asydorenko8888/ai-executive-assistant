import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import type { CalendarEvent } from '@/src/entities/calendar/types';
import {
  buildCalendarConflictAlternativesOnlyReply,
  formatConflictSlotLabelWithDay,
  resolveConflictDayOffset,
} from '@/src/features/agent/calendar/calendarConflictReplies';
import {
  buildCalendarPendingAction,
  getCalendarConversationSnapshot,
  resetCalendarConversationState,
  transitionCalendarConversationState,
} from '@/src/features/agent/calendar/calendarConversationState';
import { syncConversationStateForConflictAlternatives } from '@/src/features/agent/calendar/calendarConversationSync';
import { findConflictingTimedEvents } from '@/src/features/agent/calendar/calendarScheduleConflictCore';
import { classifyPendingCalendarReply } from '@/src/features/agent/calendar/calendarPendingReplyClassifier';
import {
  buildConflictFollowUpTranscript,
  resolvePendingConflictResolution,
} from '@/src/features/agent/calendar/calendarPendingConflictResolution';
import { parseCalendarCreateSchedule } from '@/src/features/agent/calendar/calendarCreateScheduleParser';
import { formatDateKey } from '@/src/features/agent/calendarIntelligence/zonedEventTime';
import { normalizeCalendarEvents } from '@/src/features/agent/calendarIntelligence/normalizeEvents';
import { getFreeWindows } from '@/src/features/agent/calendarIntelligence/scheduleHelpers';
import {
  addDaysToZonedYmd,
  getExecutiveCalendarTimezone,
  getZonedDayRange,
  getZonedYmd,
} from '@/src/features/agent/calendar/calendarTimezone';
import { pendingConflictContextFromCheck } from '@/src/features/agent/calendar/calendarConflictPendingContext';

const referenceNow = new Date('2026-05-27T10:00:00-05:00');
const existingStartMs = Date.parse('2026-05-28T11:00:00-05:00');
const existingEndMs = Date.parse('2026-05-28T12:00:00-05:00');
const massageStartMs = Date.parse('2026-05-28T11:00:00-05:00');
const massageEndMs = Date.parse('2026-05-28T12:00:00-05:00');

function existingEvent(): CalendarEvent {
  return {
    id: 'existing-meeting',
    title: 'Existing',
    startsAt: '2026-05-28T11:00:00-05:00',
    endsAt: '2026-05-28T12:00:00-05:00',
    isAllDay: false,
  };
}

function buildMassagePending() {
  return buildCalendarPendingAction({
    actionType: 'create',
    originalIntent: 'массаж завтра 11:00',
    eventTitle: 'Массаж',
    sourceTranscript: 'массаж завтра 11:00',
    titleSourceTranscript: 'массаж завтра 11:00',
    languageCode: 'ru-RU',
    proposedStartMs: massageStartMs,
    proposedEndMs: massageEndMs,
    conflictEvents: [
      {
        eventId: 'existing-meeting',
        title: 'Existing',
        startsAt: '2026-05-28T11:00:00-05:00',
        endsAt: '2026-05-28T12:00:00-05:00',
      },
    ],
  });
}

function buildAlternativeLabels(events: CalendarEvent[], proposedStartMs: number, proposedEndMs: number) {
  const timeZone = getExecutiveCalendarTimezone();
  const dayOffset = resolveConflictDayOffset(proposedStartMs, referenceNow);
  const range = getZonedDayRange(referenceNow, dayOffset, timeZone);
  const targetYmd = addDaysToZonedYmd(getZonedYmd(referenceNow, timeZone), dayOffset);
  const day = {
    dateKey: formatDateKey(targetYmd),
    dayOffset,
    range,
    timezone: timeZone,
  };
  const durationMinutes = Math.max(15, Math.round((proposedEndMs - proposedStartMs) / 60_000));
  const normalized = normalizeCalendarEvents(events, timeZone);
  const slots = getFreeWindows(normalized, day, referenceNow, durationMinutes);

  return slots.slice(0, 3).map((slot) =>
    formatConflictSlotLabelWithDay({
      slot,
      referenceNow,
      locale: 'ru',
      timeZone,
    }),
  );
}

describe('conflict rejection offers alternative slots', () => {
  beforeEach(() => {
    resetCalendarConversationState('test_reset');
  });

  it('detects conflict for massage tomorrow 11:00 against existing 11:00–12:00', () => {
    const conflicts = findConflictingTimedEvents({
      events: [existingEvent()],
      proposedStartMs: massageStartMs,
      proposedEndMs: massageEndMs,
    });

    assert.equal(conflicts.length, 1);
  });

  it('resolves нет as suggest_alternatives without creating', () => {
    const pending = buildMassagePending();
    let createCalls = 0;

    const resolution = resolvePendingConflictResolution({
      pending,
      transcript: 'нет',
      classification: classifyPendingCalendarReply('нет'),
      referenceNow,
    });

    assert.equal(resolution.kind, 'suggest_alternatives');

    if (resolution.kind === 'execute_original') {
      createCalls += 1;
    }

    assert.equal(createCalls, 0);
  });

  it('builds rejection reply with free slots on the same day', () => {
    const labels = buildAlternativeLabels([existingEvent()], massageStartMs, massageEndMs);
    const reply = buildCalendarConflictAlternativesOnlyReply({
      locale: 'ru',
      optionLabels: labels,
    });

    assert.match(reply, /не создаю поверх конфликта/i);
    assert.match(reply, /Могу предложить/i);
    assert.match(reply, /Или назовите своё время/i);
    assert.match(reply, /12:00/);
    assert.doesNotMatch(reply, /всё равно создать/i);
    assert.doesNotMatch(reply, /ничего не менял/i);
  });

  it('moves to WAITING_ALTERNATIVE_SLOT and keeps pending title after rejection', () => {
    const pending = buildMassagePending();
    const context = pendingConflictContextFromCheck({
      operation: 'create',
      sourceTranscript: pending.sourceTranscript,
      titleSourceTranscript: pending.titleSourceTranscript ?? pending.sourceTranscript,
      languageCode: pending.languageCode,
      proposedTitle: pending.eventTitle,
      proposedStartMs: pending.requestedStartMs,
      proposedEndMs: pending.requestedEndMs,
      conflictingEventId: pending.conflictEvents[0]!.eventId,
      conflictingTitle: pending.conflictEvents[0]!.title,
      conflictingStartsAt: pending.conflictEvents[0]!.startsAt,
      conflictingEndsAt: pending.conflictEvents[0]!.endsAt,
    });

    transitionCalendarConversationState({
      toState: 'WAITING_CONFLICT_CONFIRMATION',
      pendingAction: pending,
      reason: 'test_conflict',
    });

    syncConversationStateForConflictAlternatives(context, [
      Date.parse('2026-05-28T12:00:00-05:00'),
      Date.parse('2026-05-28T13:00:00-05:00'),
      Date.parse('2026-05-28T15:00:00-05:00'),
    ]);

    const snapshot = getCalendarConversationSnapshot();
    assert.equal(snapshot.state, 'WAITING_ALTERNATIVE_SLOT');
    assert.equal(snapshot.pendingAction?.eventTitle, 'Массаж');
    assert.equal(snapshot.pendingAction?.alternativeStartMs?.length, 3);
  });

  it('creates massage at tomorrow 12:00 when user names that time', () => {
    const pending = buildMassagePending();

    transitionCalendarConversationState({
      toState: 'WAITING_ALTERNATIVE_SLOT',
      pendingAction: {
        ...pending,
        alternativeStartMs: [
          Date.parse('2026-05-28T12:00:00-05:00'),
          Date.parse('2026-05-28T13:00:00-05:00'),
          Date.parse('2026-05-28T15:00:00-05:00'),
        ],
      },
      reason: 'test_alternatives',
    });

    const resolution = resolvePendingConflictResolution({
      pending: getCalendarConversationSnapshot().pendingAction!,
      transcript: 'завтра 12:00',
      classification: classifyPendingCalendarReply('завтра 12:00'),
      referenceNow,
    });

    assert.equal(resolution.kind, 'execute_with_schedule');

    if (resolution.kind === 'execute_with_schedule') {
      const transcript = buildConflictFollowUpTranscript(pending, 'завтра 12:00');
      assert.match(transcript, /массаж/i);

      const schedule = parseCalendarCreateSchedule(transcript, referenceNow);
      assert.equal(schedule.ok, true);

      if (schedule.ok) {
        assert.equal(schedule.startMs, Date.parse('2026-05-28T12:00:00-05:00'));
        assert.equal(schedule.endMs, Date.parse('2026-05-28T13:00:00-05:00'));
      }
    }
  });

  it('clears pending on отмена from alternative slot state', () => {
    const pending = buildMassagePending();

    transitionCalendarConversationState({
      toState: 'WAITING_ALTERNATIVE_SLOT',
      pendingAction: pending,
      reason: 'test_alternatives',
    });

    const resolution = resolvePendingConflictResolution({
      pending,
      transcript: 'отмена',
      classification: classifyPendingCalendarReply('отмена'),
      referenceNow,
    });

    assert.equal(resolution.kind, 'cancel');
  });
});
