import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseCalendarCreateSchedule } from '@/src/features/agent/calendar/calendarCreateScheduleParser';
import { getZonedTimeParts } from '@/src/features/agent/calendar/calendarTimezone';

const timeZone = 'America/Chicago';
const referenceNow = new Date('2026-06-01T16:09:00-05:00');

function expectHour(schedule: ReturnType<typeof parseCalendarCreateSchedule>, hour: number, minute = 0) {
  assert.equal(schedule.ok, true);

  if (!schedule.ok) {
    return;
  }

  const parts = getZonedTimeParts(new Date(schedule.startMs), timeZone);
  assert.equal(parts.hour, hour, `expected hour ${hour}, got ${parts.hour}:${parts.minute}`);
  assert.equal(parts.minute, minute);
  assert.equal(schedule.explicitDayOffset, 0);
}

describe('calendar create past-time guard', () => {
  it('infers PM for bare "at 9" when morning time has passed', () => {
    const schedule = parseCalendarCreateSchedule(
      'Add meditation at 9',
      referenceNow,
      timeZone,
      'en',
    );

    expectHour(schedule, 21);
  });

  it('creates today 9 PM when user says 9 PM explicitly', () => {
    const schedule = parseCalendarCreateSchedule(
      'Add meditation at 9 PM',
      referenceNow,
      timeZone,
      'en',
    );

    expectHour(schedule, 21);
  });

  it('asks to move explicit 9 AM to tomorrow when morning time passed', () => {
    const schedule = parseCalendarCreateSchedule(
      'Add meditation at 9 AM',
      referenceNow,
      timeZone,
      'en',
    );

    assert.equal(schedule.ok, false);

    if (schedule.ok) {
      return;
    }

    assert.equal(schedule.reason, 'past_time_needs_clarification');
    assert.match(schedule.detail, /9:00\s*AM.*already passed/i);
    assert.match(schedule.detail, /Do you mean tomorrow at 0?9:00\s*AM/i);
  });

  it('infers PM for Russian bare hour after noon', () => {
    const schedule = parseCalendarCreateSchedule(
      'Добавь медитацию в 9',
      referenceNow,
      timeZone,
      'ru',
    );

    expectHour(schedule, 21);
  });

  it('does not block future explicit times on the same day', () => {
    const schedule = parseCalendarCreateSchedule(
      'Add meditation at 6:00 PM',
      referenceNow,
      timeZone,
      'en',
    );

    expectHour(schedule, 18);
  });
});
