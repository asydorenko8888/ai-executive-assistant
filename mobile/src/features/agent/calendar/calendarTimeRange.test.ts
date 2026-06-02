import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CalendarEvent } from '@/src/entities/calendar/types';
import { parseCalendarCreateSchedule } from '@/src/features/agent/calendar/calendarCreateScheduleParser';
import { findCalendarEventForUpdateFromEvents } from '@/src/features/agent/calendarIntelligence/eventAtTimeMatch';
import {
  parseCalendarPointSchedule,
  parseCalendarTimeShift,
} from '@/src/features/agent/calendarIntelligence/calendarClockParser';
import { getZonedTimeParts } from '@/src/features/agent/calendar/calendarTimezone';

const referenceNow = new Date('2026-06-01T10:00:00-05:00');
const timeZone = 'America/Chicago';

function zonedHourMinute(instantMs: number) {
  const parts = getZonedTimeParts(new Date(instantMs), timeZone);

  return { hour: parts.hour, minute: parts.minute, dayOffset: parts.day };
}

describe('calendar time range parsing', () => {
  it('parses create "с 4:00 до 5:00 вечера" as 16:00-17:00', () => {
    const transcript = 'Переговоры завтра с 4:00 до 5:00 вечера';
    const schedule = parseCalendarCreateSchedule(transcript, referenceNow, timeZone);

    assert.equal(schedule.ok, true);

    if (!schedule.ok) {
      return;
    }

    const start = zonedHourMinute(schedule.startMs);
    const end = zonedHourMinute(schedule.endMs);

    assert.equal(start.hour, 16, 'start hour');
    assert.equal(start.minute, 0, 'start minute');
    assert.equal(end.hour, 17, 'end hour');
    assert.equal(end.minute, 0, 'end minute');
    assert.equal(schedule.explicitDayOffset, 1);
  });

  it('parses bare "с 4 до 5 вечера" as 16:00-17:00', () => {
    const schedule = parseCalendarPointSchedule('с 4 до 5 вечера', referenceNow, timeZone);

    assert.equal(schedule.ok, true);

    if (!schedule.ok) {
      return;
    }

    assert.equal(zonedHourMinute(schedule.startMs).hour, 16);
    assert.equal(zonedHourMinute(schedule.endMs).hour, 17);
  });

  it('parses English "from 4 PM to 5 PM"', () => {
    const shift = parseCalendarTimeShift('Meeting tomorrow from 4 PM to 5 PM', referenceNow, timeZone);

    assert.equal(shift.ok, true);

    if (!shift.ok) {
      return;
    }

    assert.equal(zonedHourMinute(shift.fromMs).hour, 16);
    assert.equal(zonedHourMinute(shift.toMs).hour, 17);
  });

  it('parses hyphen "4:00-5:00 PM"', () => {
    const schedule = parseCalendarPointSchedule('Walk tomorrow 4:00-5:00 PM', referenceNow, timeZone);

    assert.equal(schedule.ok, true);

    if (!schedule.ok) {
      return;
    }

    assert.equal(zonedHourMinute(schedule.startMs).hour, 16);
    assert.equal(zonedHourMinute(schedule.endMs).hour, 17);
  });

  it('never uses range end as start for from-to create', () => {
    const schedule = parseCalendarCreateSchedule(
      'Переговоры завтра с 4:00 до 5:00 вечера',
      referenceNow,
      timeZone,
    );

    assert.equal(schedule.ok, true);

    if (!schedule.ok) {
      return;
    }

    assert.notEqual(zonedHourMinute(schedule.startMs).hour, 17);
    assert.equal(zonedHourMinute(schedule.startMs).hour, 16);
  });
});

describe('calendar update uses live event time for "Было"', () => {
  const tomorrowStart = '2026-06-02T16:00:00-05:00';
  const tomorrowEnd = '2026-06-02T17:00:00-05:00';

  const calendarEvent: CalendarEvent = {
    id: 'negotiation-1',
    title: 'Переговоры',
    startsAt: tomorrowStart,
    endsAt: tomorrowEnd,
    isAllDay: false,
  };

  it('finds tomorrow event by title when update mentions завтра', () => {
    const resolved = findCalendarEventForUpdateFromEvents({
      transcript: 'Перенеси переговоры завтра 4:00 вечера',
      referenceNow,
      events: [calendarEvent],
      titleQuery: 'переговоры',
      timeZone,
    });

    assert.equal(resolved.match?.id, 'negotiation-1');
    assert.equal(resolved.fromMs, Date.parse(tomorrowStart));
  });

  it('uses calendar event start for old time, not midnight today', () => {
    const resolved = findCalendarEventForUpdateFromEvents({
      transcript: 'Перенеси переговоры завтра 4:00 вечера',
      referenceNow,
      events: [calendarEvent],
      titleQuery: 'переговоры',
      timeZone,
    });

    assert.equal(resolved.fromMs, Date.parse(tomorrowStart));

    const oldParts = getZonedTimeParts(new Date(resolved.fromMs!), timeZone);

    assert.equal(oldParts.hour, 16);
    assert.notEqual(oldParts.hour, 0);
    assert.notEqual(oldParts.hour, 12);
  });
});
