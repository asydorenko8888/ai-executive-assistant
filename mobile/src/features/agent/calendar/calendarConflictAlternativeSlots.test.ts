import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import type { CalendarEvent } from '@/src/entities/calendar/types';
import {
  buildCalendarConflictAlternativesOnlyReply,
  formatConflictSlotLabelWithDay,
  resolveConflictDayOffset,
} from '@/src/features/agent/calendar/calendarConflictReplies';
import {
  AFTERNOON_CONFLICT_RANGE,
  buildConflictAlternativeOptionSlots,
  detectVagueConflictTimePeriod,
  slotDurationMatchesRequest,
  slotRangeLooksLikeHugeWindow,
} from '@/src/features/agent/calendar/calendarConflictAlternativeSlots';
import {
  buildCalendarPendingAction,
  resetCalendarConversationState,
} from '@/src/features/agent/calendar/calendarConversationState';
import { classifyPendingCalendarReply } from '@/src/features/agent/calendar/calendarPendingReplyClassifier';
import { resolvePendingConflictResolution } from '@/src/features/agent/calendar/calendarPendingConflictResolution';
import { formatDateKey } from '@/src/features/agent/calendarIntelligence/zonedEventTime';
import { normalizeCalendarEvents } from '@/src/features/agent/calendarIntelligence/normalizeEvents';
import {
  addDaysToZonedYmd,
  getExecutiveCalendarTimezone,
  getZonedDayRange,
  getZonedYmd,
} from '@/src/features/agent/calendar/calendarTimezone';

const referenceNow = new Date('2026-05-27T10:00:00-05:00');
const meditationStartMs = Date.parse('2026-05-28T11:00:00-05:00');
const meditationEndMs = Date.parse('2026-05-28T12:00:00-05:00');
const walkStartMs = Date.parse('2026-05-28T11:00:00-05:00');
const walkEndMs = Date.parse('2026-05-28T12:00:00-05:00');

function meditationEvent(): CalendarEvent {
  return {
    id: 'meditation',
    title: 'Медитация',
    startsAt: '2026-05-28T11:00:00-05:00',
    endsAt: '2026-05-28T12:00:00-05:00',
    isAllDay: false,
  };
}

function buildWalkPending() {
  return buildCalendarPendingAction({
    actionType: 'create',
    originalIntent: 'прогулка завтра 11:00',
    eventTitle: 'Прогулка',
    sourceTranscript: 'прогулка завтра 11:00',
    titleSourceTranscript: 'прогулка завтра 11:00',
    languageCode: 'ru-RU',
    proposedStartMs: walkStartMs,
    proposedEndMs: walkEndMs,
    conflictEvents: [
      {
        eventId: 'meditation',
        title: 'Медитация',
        startsAt: '2026-05-28T11:00:00-05:00',
        endsAt: '2026-05-28T12:00:00-05:00',
      },
    ],
  });
}

function buildWalkUpdatePending() {
  return buildCalendarPendingAction({
    actionType: 'update',
    originalIntent: 'Перенеси прогулку на 19:00',
    eventTitle: 'Прогулка',
    sourceTranscript: 'Перенеси прогулку на 19:00',
    titleSourceTranscript: 'Перенеси прогулку на 19:00',
    languageCode: 'ru-RU',
    proposedStartMs: walkStartMs,
    proposedEndMs: walkEndMs,
    alternativeStartMs: [
      Date.parse('2026-05-28T10:00:00-05:00'),
      Date.parse('2026-05-28T13:00:00-05:00'),
    ],
    conflictEvents: [
      {
        eventId: 'meditation',
        title: 'Медитация',
        startsAt: '2026-05-28T11:00:00-05:00',
        endsAt: '2026-05-28T12:00:00-05:00',
      },
    ],
  });
}

function buildTomorrowDayContext() {
  const timeZone = getExecutiveCalendarTimezone();
  const dayOffset = resolveConflictDayOffset(walkStartMs, referenceNow);
  const range = getZonedDayRange(referenceNow, dayOffset, timeZone);
  const targetYmd = addDaysToZonedYmd(getZonedYmd(referenceNow, timeZone), dayOffset);

  return {
    dateKey: formatDateKey(targetYmd),
    dayOffset,
    range,
    timezone: timeZone,
  };
}

function buildAlternativeLabels(events: CalendarEvent[]) {
  const timeZone = getExecutiveCalendarTimezone();
  const day = buildTomorrowDayContext();
  const normalized = normalizeCalendarEvents(events, timeZone);
  const slots = buildConflictAlternativeOptionSlots({
    events: normalized,
    day,
    referenceNow,
    durationMinutes: 60,
    excludeStartMs: walkStartMs,
    excludeEndMs: walkEndMs,
    conflictEndMs: meditationEndMs,
  });

  return slots.map((slot) =>
    formatConflictSlotLabelWithDay({
      slot,
      referenceNow,
      locale: 'ru',
      timeZone,
    }),
  );
}

describe('calendar conflict alternative slots', () => {
  beforeEach(() => {
    resetCalendarConversationState('test_reset');
  });

  it('returns only 1-hour slots after conflict on the same day', () => {
    const labels = buildAlternativeLabels([meditationEvent()]);

    assert.equal(labels.length, 3);
    assert.ok(labels.every((label) => /–/.test(label)));
    assert.ok(labels.every((label) => !/12:00 AM–11:00 AM/i.test(label)));
    assert.ok(labels.every((label) => !/12:00 PM–08:00 PM/i.test(label)));
    assert.match(labels[0]!, /12:00/);
    assert.ok(labels.every((label) => !/11:00 AM–12:00 PM/.test(label)));
  });

  it('excludes the originally conflicting 11:00–12:00 slot', () => {
    const timeZone = getExecutiveCalendarTimezone();
    const day = buildTomorrowDayContext();
    const normalized = normalizeCalendarEvents([meditationEvent()], timeZone);
    const slots = buildConflictAlternativeOptionSlots({
      events: normalized,
      day,
      referenceNow,
      durationMinutes: 60,
      excludeStartMs: walkStartMs,
      excludeEndMs: walkEndMs,
      conflictEndMs: meditationEndMs,
    });

    assert.equal(slots.length, 3);
    assert.ok(slotDurationMatchesRequest(slots[0]!, 60));
    assert.ok(slots.every((slot) => !slotRangeLooksLikeHugeWindow(slot)));
    assert.ok(
      slots.every(
        (slot) =>
          !(
            slot.startMinutes === 11 * 60 &&
            slot.endMinutes === 12 * 60
          ),
      ),
    );
  });

  it('resolves нет as suggest_alternatives without creating', () => {
    const pending = buildWalkPending();
    const resolution = resolvePendingConflictResolution({
      pending,
      transcript: 'нет',
      classification: classifyPendingCalendarReply('нет'),
      referenceNow,
    });

    assert.equal(resolution.kind, 'suggest_alternatives');
    assert.notEqual(resolution.kind, 'execute_original');
  });

  it('treats завтра час дня as vague afternoon, not confirmation', () => {
    const pending = buildWalkPending();
    const resolution = resolvePendingConflictResolution({
      pending,
      transcript: 'завтра час дня',
      classification: classifyPendingCalendarReply('завтра час дня'),
      referenceNow,
    });

    assert.equal(resolution.kind, 'suggest_alternatives');
    if (resolution.kind === 'suggest_alternatives') {
      assert.deepEqual(resolution.preferredRange, AFTERNOON_CONFLICT_RANGE);
    }
    assert.notEqual(resolution.kind, 'execute_with_schedule');
  });

  it('creates over conflict on explicit override', () => {
    const pending = buildWalkPending();
    const resolution = resolvePendingConflictResolution({
      pending,
      transcript: 'все равно создай',
      classification: classifyPendingCalendarReply('все равно создай'),
      referenceNow,
    });

    assert.equal(resolution.kind, 'execute_original');
  });

  it('does not re-run full update command as conflict time follow-up', () => {
    const pending = buildWalkUpdatePending();
    const resolution = resolvePendingConflictResolution({
      pending,
      transcript: 'перенеси на 7 вечера',
      classification: classifyPendingCalendarReply('перенеси на 7 вечера'),
      referenceNow,
    });

    assert.notEqual(resolution.kind, 'execute_with_time');
    assert.notEqual(resolution.kind, 'execute_original');
  });

  it('builds rejection reply without huge ranges', () => {
    const labels = buildAlternativeLabels([meditationEvent()]);
    const reply = buildCalendarConflictAlternativesOnlyReply({
      locale: 'ru',
      optionLabels: labels,
    });

    assert.match(reply, /не создавал|did not create/i);
    assert.doesNotMatch(reply, /12:00 AM–11:00 AM/i);
    assert.doesNotMatch(reply, /12:00 PM–08:00 PM/i);
    assert.doesNotMatch(reply, /11:00 AM–12:00 PM/);
  });

  it('detects vague afternoon phrases', () => {
    assert.deepEqual(detectVagueConflictTimePeriod('завтра час дня'), AFTERNOON_CONFLICT_RANGE);
    assert.equal(detectVagueConflictTimePeriod('завтра 14:00'), null);
  });
});
