import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseSpokenTimeFragment } from '@/src/features/agent/calendar/calendarSpokenTime';
import {
  extractCalendarClockFragment,
  parseCalendarPointSchedule,
  parseClockFragmentToMinutes,
} from '@/src/features/agent/calendarIntelligence/calendarClockParser';
import { parseCalendarCreateSchedule } from '@/src/features/agent/calendar/calendarCreateScheduleParser';

const referenceNow = new Date('2026-06-01T10:00:00-05:00');

function expectMinutes(transcript: string, expectedHour: number, expectedMinute = 0) {
  const fragment = extractCalendarClockFragment(transcript);
  const minutes = fragment
    ? parseClockFragmentToMinutes(fragment.fragment, transcript)
    : null;

  assert.equal(
    minutes,
    expectedHour * 60 + expectedMinute,
    `extract=${JSON.stringify(fragment)} transcript=${transcript}`,
  );
}

describe('Russian/Ukrainian evening time parsing', () => {
  const cases: Array<{ phrase: string; hour: number; minute?: number }> = [
    { phrase: 'на 4 вечера', hour: 16 },
    { phrase: 'на четыре вечера', hour: 16 },
    { phrase: 'на 4:00 вечера', hour: 16 },
    { phrase: 'на 4 PM', hour: 16 },
    { phrase: 'на 16:00', hour: 16 },
    { phrase: 'Добавь переговоры на 4:00 вечера', hour: 16 },
    { phrase: 'переговоры на 4:00 вечера', hour: 16 },
    { phrase: 'на семь вечера', hour: 19 },
    { phrase: 'на 8 вечера', hour: 20 },
    { phrase: 'на 9 вечера', hour: 21 },
    { phrase: '9 утра', hour: 9 },
    { phrase: 'о 4 PM', hour: 16 },
    { phrase: 'девятнадцать часов', hour: 19 },
    { phrase: '19 часов', hour: 19 },
    { phrase: 'Сегодня девятнадцать часов', hour: 19 },
    { phrase: 'одиннадцать вечера', hour: 23 },
    { phrase: 'десять утра', hour: 10 },
    { phrase: 'семь вечера', hour: 19 },
  ];

  for (const { phrase, hour, minute = 0 } of cases) {
    it(`parses "${phrase}" as ${hour}:${String(minute).padStart(2, '0')}`, () => {
      expectMinutes(phrase, hour, minute);
    });
  }

  it('never maps colon-evening false positive to midnight', () => {
    assert.notEqual(parseSpokenTimeFragment('на 4:00 вечера'), '00:00');
    assert.notEqual(parseSpokenTimeFragment('Добавь переговоры на 4:00 вечера'), '00:00');
  });

  it('parseCalendarCreateSchedule resolves час дня to 13:00', () => {
    const schedule = parseCalendarCreateSchedule(
      'Добавь медитацию завтра час дня',
      referenceNow,
    );

    assert.equal(schedule.ok, true);

    if (schedule.ok) {
      const start = new Date(schedule.startMs);
      assert.equal(start.getUTCHours(), 18);
      assert.equal(start.getUTCMinutes(), 0);
    }
  });

  it('parseCalendarCreateSchedule resolves 4:00 вечера to 16:00', () => {
    const schedule = parseCalendarCreateSchedule(
      'Добавь переговоры на 4:00 вечера',
      referenceNow,
    );

    assert.equal(schedule.ok, true);

    if (schedule.ok) {
      const point = parseCalendarPointSchedule(
        'Добавь переговоры на 4:00 вечера',
        referenceNow,
      );

      assert.equal(point.ok, true);

      if (point.ok) {
        const date = new Date(point.startMs);
        const hour = date.getUTCHours();
        // reference is -05:00, executive TZ may differ — compare via minutes parser
        const mins = parseClockFragmentToMinutes(
          extractCalendarClockFragment('Добавь переговоры на 4:00 вечера')!.fragment,
          'Добавь переговоры на 4:00 вечера',
        );
        assert.equal(mins, 16 * 60);
      }
    }
  });
});
