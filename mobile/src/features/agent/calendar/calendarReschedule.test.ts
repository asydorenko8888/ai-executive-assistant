import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CalendarEvent } from '@/src/entities/calendar/types';
import {
  parseCalendarUpdateSchedule,
  resolveUpdateTargetMs,
} from '@/src/features/agent/calendar/calendarUpdateScheduleParser';
import { buildCalendarUpdateEventPayload } from '@/src/features/agent/execution/calendarUpdatePayloadBuilder';
import { getExecutiveCalendarTimezone, getZonedTimeParts } from '@/src/features/agent/calendar/calendarTimezone';
import { findCalendarEventForUpdateFromEvents } from '@/src/features/agent/calendarIntelligence/eventAtTimeMatch';

const timeZone = 'America/Chicago';
const referenceNow = new Date('2026-05-28T20:00:00-05:00');

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
});
