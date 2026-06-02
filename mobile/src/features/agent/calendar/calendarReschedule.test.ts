import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CalendarEvent } from '@/src/entities/calendar/types';
import {
  parseCalendarUpdateSchedule,
  resolveUpdateTargetMs,
} from '@/src/features/agent/calendar/calendarUpdateScheduleParser';
import { extractCalendarUpdateParameters } from '@/src/features/agent/calendar/calendarUpdateIntentExtractor';
import {
  recordModifiedConversationEvent,
  resetConversationEventMemory,
} from '@/src/features/agent/calendar/calendarConversationEventMemory';
import { resetCalendarConversationState } from '@/src/features/agent/calendar/calendarConversationState';
import { buildCalendarUpdateEventPayload } from '@/src/features/agent/execution/calendarUpdatePayloadBuilder';
import { getExecutiveCalendarTimezone, getZonedTimeParts } from '@/src/features/agent/calendar/calendarTimezone';
import { findCalendarEventForUpdateFromEvents } from '@/src/features/agent/calendarIntelligence/eventAtTimeMatch';

const timeZone = 'America/Chicago';
const referenceNow = new Date('2026-05-28T20:00:00-05:00');

function resetCalendarTestState() {
  resetConversationEventMemory('test_reset');
  resetCalendarConversationState('test_reset');
}

function chicagoEvent(id: string, title: string, hour: number, minute = 0, dayOffset = 0): CalendarEvent {
  const base = new Date(referenceNow);
  base.setDate(base.getDate() + dayOffset);
  const pad = (value: number) => String(value).padStart(2, '0');
  const y = base.getFullYear();
  const m = pad(base.getMonth() + 1);
  const d = pad(base.getDate());
  const start = `${y}-${m}-${d}T${pad(hour)}:${pad(minute)}:00-05:00`;
  const end = new Date(start);
  end.setMinutes(end.getMinutes() + 60);

  return {
    id,
    title,
    startsAt: start,
    endsAt: end.toISOString(),
    isAllDay: false,
  };
}

function zonedHourMinute(ms: number) {
  const parts = getZonedTimeParts(new Date(ms), timeZone);

  return { hour: parts.hour, minute: parts.minute, day: parts.day };
}

describe('calendar natural language reschedule', () => {
  it('stores ISO instants in extraction, never localized display strings', () => {
    resetConversationEventMemory('test');
    const walkTomorrow = chicagoEvent('walk-tomorrow', 'Прогулка', 11, 0, 1);

    recordModifiedConversationEvent({
      eventId: walkTomorrow.id,
      title: walkTomorrow.title,
      startISO: walkTomorrow.startsAt,
      endISO: walkTomorrow.endsAt,
    });

    const extracted = extractCalendarUpdateParameters(
      'Перенеси её на 2 часа позже',
      referenceNow,
    );

    assert.equal(extracted.readyToExecute, true);
    assert.equal(extracted.toTime, '13:00');
    assert.ok(!/(?:дня|утра|завтра)/iu.test(extracted.toTime ?? ''));
    assert.equal(
      Date.parse(extracted.toStartISO ?? ''),
      Date.parse('2026-05-29T13:00:00-05:00'),
    );
    assert.equal(
      Date.parse(extracted.fromStartISO ?? ''),
      Date.parse(walkTomorrow.startsAt),
    );
  });

  it('parses English relative shifts (minutes and hours)', () => {
    const twoHours = parseCalendarUpdateSchedule('Move walk 2 hours later', referenceNow, timeZone);
    assert.equal(twoHours.ok, true);

    if (twoHours.ok) {
      assert.equal(twoHours.kind, 'relative_offset');
      assert.equal(twoHours.offsetMs, 2 * 60 * 60_000);
      assert.equal(twoHours.direction, 'later');
    }

    const thirtyMin = parseCalendarUpdateSchedule('Move walk 30 minutes later', referenceNow, timeZone);
    assert.equal(thirtyMin.ok, true);

    if (thirtyMin.ok) {
      assert.equal(thirtyMin.kind, 'relative_offset');
      assert.equal(thirtyMin.offsetMs, 30 * 60_000);
    }

    const earlier = parseCalendarUpdateSchedule('Move walk earlier by 1 hour', referenceNow, timeZone);
    assert.equal(earlier.ok, true);

    if (earlier.ok) {
      assert.equal(earlier.kind, 'relative_offset');
      assert.equal(earlier.direction, 'earlier');
      assert.equal(earlier.offsetMs, 60 * 60_000);
    }
  });

  it('shifts walk 2 hours later from 21:00 to 23:00', () => {
    const walk = chicagoEvent('walk', 'Walk', 21);
    const startMs = Date.parse(walk.startsAt);
    const schedule = parseCalendarUpdateSchedule('Move walk 2 hours later', referenceNow, timeZone);

    assert.equal(schedule.ok, true);

    if (!schedule.ok) {
      return;
    }

    const toMs = resolveUpdateTargetMs({
      schedule,
      matchedEventStartMs: startMs,
      referenceNow,
      timeZone,
    });

    assert.ok(toMs);
    const resolved = zonedHourMinute(toMs!);
    assert.equal(resolved.hour, 23);
    assert.equal(resolved.minute, 0);
  });

  it('moves meditation to tomorrow preserving wall-clock time', () => {
    const meditation = chicagoEvent('med', 'Meditation', 22);
    const startMs = Date.parse(meditation.startsAt);
    const schedule = parseCalendarUpdateSchedule('Move meditation to tomorrow', referenceNow, timeZone);

    assert.equal(schedule.ok, true);

    if (!schedule.ok) {
      return;
    }

    assert.equal(schedule.kind, 'day_preserve_time');
    assert.equal(schedule.explicitDayOffset, 1);

    const toMs = resolveUpdateTargetMs({
      schedule,
      matchedEventStartMs: startMs,
      referenceNow,
      timeZone,
    });

    assert.ok(toMs);
    const resolved = zonedHourMinute(toMs!);
    assert.equal(resolved.hour, 22);
    assert.equal(resolved.day, 29);
  });

  it('preserves event date when user specifies only destination time', () => {
    const walkTomorrow = chicagoEvent('walk-tomorrow', 'Прогулка', 11, 0, 1);
    const startMs = Date.parse(walkTomorrow.startsAt);
    const schedule = parseCalendarUpdateSchedule('Перенеси её на 13:00', referenceNow, timeZone);

    assert.equal(schedule.ok, true);

    if (!schedule.ok) {
      return;
    }

    assert.equal(schedule.kind, 'destination');
    assert.equal(schedule.hasExplicitDay, false);

    const toMs = resolveUpdateTargetMs({
      schedule,
      matchedEventStartMs: startMs,
      referenceNow,
      timeZone,
    });

    assert.ok(toMs);
    const resolved = zonedHourMinute(toMs!);
    assert.equal(resolved.hour, 13);
    assert.equal(resolved.minute, 0);
    assert.equal(resolved.day, 29);
  });

  it('preserves event date for relative hour shift', () => {
    const walkTomorrow = chicagoEvent('walk-tomorrow', 'Прогулка', 13, 0, 1);
    const startMs = Date.parse(walkTomorrow.startsAt);
    const schedule = parseCalendarUpdateSchedule('Перенеси её на час позже', referenceNow, timeZone);

    assert.equal(schedule.ok, true);

    if (!schedule.ok) {
      return;
    }

    assert.equal(schedule.kind, 'relative_offset');

    const toMs = resolveUpdateTargetMs({
      schedule,
      matchedEventStartMs: startMs,
      referenceNow,
      timeZone,
    });

    assert.ok(toMs);
    const resolved = zonedHourMinute(toMs!);
    assert.equal(resolved.hour, 14);
    assert.equal(resolved.day, 29);
  });

  it('uses explicit date when user says tomorrow with time', () => {
    const walkTomorrow = chicagoEvent('walk-tomorrow', 'Прогулка', 13, 0, 1);
    const startMs = Date.parse(walkTomorrow.startsAt);
    const schedule = parseCalendarUpdateSchedule('Перенеси её на завтра 15:00', referenceNow, timeZone);

    assert.equal(schedule.ok, true);

    if (!schedule.ok) {
      return;
    }

    assert.equal(schedule.kind, 'destination');
    assert.equal(schedule.hasExplicitDay, true);

    const toMs = resolveUpdateTargetMs({
      schedule,
      matchedEventStartMs: startMs,
      referenceNow,
      timeZone,
    });

    assert.ok(toMs);
    const resolved = zonedHourMinute(toMs!);
    assert.equal(resolved.hour, 15);
    assert.equal(resolved.minute, 0);
    assert.equal(resolved.day, 29);
  });

  it('moves meeting to tomorrow at 15:00', () => {
    const meeting = chicagoEvent('meet', 'Meeting', 10);
    const schedule = parseCalendarUpdateSchedule(
      'Move meeting to tomorrow at 15:00',
      referenceNow,
      timeZone,
    );

    assert.equal(schedule.ok, true);

    if (!schedule.ok) {
      return;
    }

    assert.equal(schedule.kind, 'destination');

    const toMs = resolveUpdateTargetMs({
      schedule,
      matchedEventStartMs: Date.parse(meeting.startsAt),
      referenceNow,
      timeZone,
    });

    assert.ok(toMs);
    const resolved = zonedHourMinute(toMs!);
    assert.equal(resolved.hour, 15);
    assert.equal(resolved.minute, 0);
    assert.equal(resolved.day, 29);
  });

  it('parses day periods and next week shifts', () => {
    const morning = parseCalendarUpdateSchedule('Move standup to morning', referenceNow, timeZone);
    assert.equal(morning.ok, true);

    if (morning.ok) {
      assert.equal(morning.kind, 'day_period');
      assert.equal(morning.clockMinutes, 9 * 60);
    }

    const nextWeek = parseCalendarUpdateSchedule('Move review to next week', referenceNow, timeZone);
    assert.equal(nextWeek.ok, true);

    if (nextWeek.ok) {
      assert.equal(nextWeek.kind, 'event_day_shift');
      assert.equal(nextWeek.shiftDays, 7);
    }
  });

  it('builds PATCH payload in executive timezone preserving duration', () => {
    const walk = chicagoEvent('walk', 'Walk', 21);
    const payload = buildCalendarUpdateEventPayload({
      transcript: 'Move walk 2 hours later',
      languageCode: 'en-US',
      referenceNow,
      matchedEvent: walk,
    });

    assert.equal(payload.ok, true);

    if (!payload.ok) {
      return;
    }

    assert.equal(payload.payload.start.timeZone, getExecutiveCalendarTimezone());
    assert.equal(payload.payload.end.timeZone, getExecutiveCalendarTimezone());
    assert.match(payload.payload.start.dateTime ?? '', /T23:00:00$/);
    assert.match(payload.payload.end.dateTime ?? '', /T00:00:00$/);
  });

  it('resolves event from fresh list for relative and destination updates', () => {
    resetCalendarTestState();
    const walk = chicagoEvent('walk', 'Walk', 21);

    const relative = findCalendarEventForUpdateFromEvents({
      transcript: 'Move walk 2 hours later',
      referenceNow,
      events: [walk],
      titleQuery: 'walk',
      timeZone,
    });

    assert.equal(relative.match?.id, 'walk');
    assert.equal(relative.toMs, Date.parse(walk.startsAt) + 2 * 60 * 60_000);
  });

  it('chains relative hour shifts on ISO instants without display string round-trip', () => {
    let eventMs = Date.parse(chicagoEvent('walk-chain', 'Прогулка', 11, 0, 1).startsAt);

    const plusTwo = parseCalendarUpdateSchedule('Перенеси её на 2 часа позже', referenceNow, timeZone);
    assert.equal(plusTwo.ok, true);

    if (!plusTwo.ok) {
      return;
    }

    const afterPlusTwo = resolveUpdateTargetMs({
      schedule: plusTwo,
      matchedEventStartMs: eventMs,
      referenceNow,
      timeZone,
    });

    assert.ok(afterPlusTwo);
    assert.equal(zonedHourMinute(afterPlusTwo!).hour, 13);
    assert.equal(zonedHourMinute(afterPlusTwo!).minute, 0);
    eventMs = afterPlusTwo!;

    const minusThree = parseCalendarUpdateSchedule('Перенеси её на 3 часа раньше', referenceNow, timeZone);
    assert.equal(minusThree.ok, true);

    if (!minusThree.ok) {
      return;
    }

    const afterMinusThree = resolveUpdateTargetMs({
      schedule: minusThree,
      matchedEventStartMs: eventMs,
      referenceNow,
      timeZone,
    });

    assert.ok(afterMinusThree);
    assert.equal(zonedHourMinute(afterMinusThree!).hour, 10);
    assert.equal(zonedHourMinute(afterMinusThree!).minute, 0);
    eventMs = afterMinusThree!;

    const plusOne = parseCalendarUpdateSchedule('Перенеси её на час позже', referenceNow, timeZone);
    assert.equal(plusOne.ok, true);

    if (!plusOne.ok) {
      return;
    }

    const afterPlusOne = resolveUpdateTargetMs({
      schedule: plusOne,
      matchedEventStartMs: eventMs,
      referenceNow,
      timeZone,
    });

    assert.ok(afterPlusOne);
    assert.equal(zonedHourMinute(afterPlusOne!).hour, 11);
    assert.equal(zonedHourMinute(afterPlusOne!).minute, 0);
  });

  it('shifts walk from 20:00 by relative earlier phrases without parsing as clock time', () => {
    const walk = chicagoEvent('walk-evening', 'Прогулка', 20, 0, 0);
    const startMs = Date.parse(walk.startsAt);

    for (const [transcript, expectedHour, expectedMinute] of [
      ['перенеси её на час раньше', 19, 0],
      ['перенеси её на 2 часа раньше', 18, 0],
      ['перенеси её на 30 минут раньше', 19, 30],
      ['перенеси прогулку на 2 часа раньше', 18, 0],
    ] as const) {
      const schedule = parseCalendarUpdateSchedule(transcript, referenceNow, timeZone);

      assert.equal(schedule.ok, true, transcript);

      if (!schedule.ok) {
        continue;
      }

      assert.equal(schedule.kind, 'relative_offset', transcript);

      const toMs = resolveUpdateTargetMs({
        schedule,
        matchedEventStartMs: startMs,
        referenceNow,
        timeZone,
      });

      assert.ok(toMs, transcript);
      const resolved = zonedHourMinute(toMs!);
      assert.equal(resolved.hour, expectedHour, transcript);
      assert.equal(resolved.minute, expectedMinute, transcript);
    }
  });
});
