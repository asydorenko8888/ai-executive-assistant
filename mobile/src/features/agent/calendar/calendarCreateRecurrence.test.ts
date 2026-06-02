import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { extractCalendarCommand } from '@/src/features/agent/calendar/calendarCommandExtractor';
import {
  extractCalendarCreateRecurrence,
  parseCalendarCreateScheduleWithRecurrence,
} from '@/src/features/agent/calendar/calendarCreateRecurrenceParser';
import { parseCalendarCreateSchedule } from '@/src/features/agent/calendar/calendarCreateScheduleParser';
import { extractCreateEventTitle } from '@/src/features/agent/calendar/calendarCreateIntentExtractor';
import {
  getExecutiveCalendarTimezone,
  getZonedTimeParts,
} from '@/src/features/agent/calendar/calendarTimezone';

/** Thursday — next Monday is four days ahead. */
const referenceNow = new Date('2026-06-04T10:00:00-05:00');

function expectMondaySchedule(startMs: number) {
  const timeZone = getExecutiveCalendarTimezone();
  const parts = getZonedTimeParts(new Date(startMs), timeZone);
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(
    new Date(startMs),
  );

  assert.equal(weekday, 'Mon');
  assert.equal(parts.hour, 11);
  assert.equal(parts.minute, 0);
}

describe('calendar create recurrence (RU/UA)', () => {
  it('parses weekly Monday RU: title, schedule, recurrence', () => {
    const transcript = 'Добавь медитацию каждый понедельник 11:00 утра';
    const recurrence = extractCalendarCreateRecurrence(transcript);

    assert.ok(recurrence);
    assert.equal(recurrence.recurrence.kind, 'weekly');
    assert.equal(recurrence.recurrence.byDay, 'MO');
    assert.equal(recurrence.recurrence.rrule, 'RRULE:FREQ=WEEKLY;BYDAY=MO');

    const title = extractCreateEventTitle(recurrence.transcriptWithoutRecurrence, {
      detectedTime: '11:00',
    });

    assert.equal(title, 'Медитация');

    const schedule = parseCalendarCreateSchedule(transcript, referenceNow);

    assert.equal(schedule.ok, true);

    if (!schedule.ok) {
      return;
    }

    assert.equal(schedule.recurrence?.rrule, 'RRULE:FREQ=WEEKLY;BYDAY=MO');
    expectMondaySchedule(schedule.startMs);
    assert.ok(schedule.explicitDayOffset >= 0);
  });

  it('parses weekly Monday UA: title, schedule, recurrence', () => {
    const transcript = 'Додай медитацію щопонеділка о 11 ранку';
    const recurrence = extractCalendarCreateRecurrence(transcript);

    assert.ok(recurrence);
    assert.equal(recurrence.recurrence.byDay, 'MO');

    const title = extractCreateEventTitle(recurrence.transcriptWithoutRecurrence, {
      detectedTime: '11:00',
    });

    assert.equal(title, 'Медитація');

    const schedule = parseCalendarCreateSchedule(transcript, referenceNow);

    assert.equal(schedule.ok, true);

    if (!schedule.ok) {
      return;
    }

    assert.equal(schedule.recurrence?.rrule, 'RRULE:FREQ=WEEKLY;BYDAY=MO');
    expectMondaySchedule(schedule.startMs);
  });

  it('parses daily RU with morning time', () => {
    const transcript = 'Добавь спорт каждый день в 8 утра';
    const recurrence = extractCalendarCreateRecurrence(transcript);

    assert.ok(recurrence);
    assert.equal(recurrence.recurrence.kind, 'daily');
    assert.equal(recurrence.recurrence.rrule, 'RRULE:FREQ=DAILY');

    const schedule = parseCalendarCreateSchedule(transcript, referenceNow);

    assert.equal(schedule.ok, true);

    if (!schedule.ok) {
      return;
    }

    assert.equal(schedule.recurrence?.rrule, 'RRULE:FREQ=DAILY');

    const timeZone = getExecutiveCalendarTimezone();
    const parts = getZonedTimeParts(new Date(schedule.startMs), timeZone);

    assert.equal(parts.hour, 8);
    assert.equal(parts.minute, 0);
  });

  it('extractCalendarCommand strips recurrence from title', () => {
    const extraction = extractCalendarCommand({
      transcript: 'Добавь медитацию каждый понедельник 11:00 утра',
      titleSourceTranscript: 'Добавь медитацию каждый понедельник 11:00 утра',
      referenceNow,
    });

    assert.equal(extraction.intent, 'calendar_create');
    assert.equal(extraction.title, 'Медитация');
    assert.ok(extraction.datetime);
  });

  it('uses today when Monday time is still in the future', () => {
    const mondayMorning = new Date('2026-06-08T08:00:00-05:00');
    const parsed = parseCalendarCreateScheduleWithRecurrence(
      'Добавь медитацию каждый понедельник 11:00 утра',
      mondayMorning,
    );

    assert.equal(parsed.recurrence?.byDay, 'MO');
    assert.equal(parsed.pointSchedule.ok, true);

    if (!parsed.pointSchedule.ok || !parsed.recurrence) {
      return;
    }

    const schedule = parseCalendarCreateSchedule(
      'Добавь медитацию каждый понедельник 11:00 утра',
      mondayMorning,
    );

    assert.equal(schedule.ok, true);

    if (!schedule.ok) {
      return;
    }

    assert.equal(schedule.explicitDayOffset, 0);
    expectMondaySchedule(schedule.startMs);
  });
});
