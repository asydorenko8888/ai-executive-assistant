import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseCalendarCreateSchedule } from '@/src/features/agent/calendar/calendarCreateScheduleParser';
import { extractCreateEventTitle } from '@/src/features/agent/calendar/calendarCreateIntentExtractor';
import {
  computeDayOffsetFromInstant,
  getZonedWeekdayIndex,
  parseNaturalDayOffset,
  parseRelativeTimeOffset,
  stripNaturalDatePhrases,
} from '@/src/features/agent/calendarIntelligence/calendarNaturalDateParser';
import { resolveTargetDayContext } from '@/src/features/agent/calendarIntelligence/resolveTargetDay';
import {
  addDaysToZonedYmd,
  getZonedTimeParts,
  getZonedYmd,
} from '@/src/features/agent/calendar/calendarTimezone';

const referenceNow = new Date('2026-05-28T12:00:00-05:00');
const timeZone = 'America/Chicago';

describe('calendarNaturalDateParser', () => {
  it('parses relative minute and hour offsets', () => {
    assert.deepEqual(parseRelativeTimeOffset('через 15 хвилин'), {
      offsetMs: 15 * 60_000,
      kind: 'minutes',
      amount: 15,
    });
    assert.deepEqual(parseRelativeTimeOffset('через годину'), {
      offsetMs: 60 * 60_000,
      kind: 'hours',
      amount: 1,
    });
    assert.deepEqual(parseRelativeTimeOffset('через 2 години'), {
      offsetMs: 2 * 60 * 60_000,
      kind: 'hours',
      amount: 2,
    });
    assert.deepEqual(parseRelativeTimeOffset('через 2 дні'), {
      offsetMs: 2 * 24 * 60 * 60_000,
      kind: 'days',
      amount: 2,
    });
  });

  it('parses day-after-tomorrow and weekend phrases', () => {
    assert.deepEqual(parseNaturalDayOffset('післязавтра', referenceNow, timeZone), {
      dayOffset: 2,
      source: 'day_after_tomorrow',
    });
    assert.deepEqual(parseNaturalDayOffset('послезавтра', referenceNow, timeZone), {
      dayOffset: 2,
      source: 'day_after_tomorrow',
    });

    const weekend = parseNaturalDayOffset('на выходных', referenceNow, timeZone);
    assert.equal(weekend?.dayOffset, 2);
    assert.equal(weekend?.source, 'weekend');

    const weekendUa = parseNaturalDayOffset('на вихідних', referenceNow, timeZone);
    assert.equal(weekendUa?.dayOffset, 2);
    assert.equal(weekendUa?.source, 'weekend');
  });

  it('parses Russian weekday names to calendar offsets from Thursday', () => {
    const phrases: Array<{ text: string; weekdayIndex: number; dayOffset: number }> = [
      { text: 'на понедельник', weekdayIndex: 1, dayOffset: 4 },
      { text: 'на вторник', weekdayIndex: 2, dayOffset: 5 },
      { text: 'на среду', weekdayIndex: 3, dayOffset: 6 },
      { text: 'на четверг', weekdayIndex: 4, dayOffset: 7 },
      { text: 'на пятницу', weekdayIndex: 5, dayOffset: 1 },
      { text: 'на субботу', weekdayIndex: 6, dayOffset: 2 },
      { text: 'на воскресенье', weekdayIndex: 0, dayOffset: 3 },
    ];

    for (const sample of phrases) {
      const resolution = parseNaturalDayOffset(sample.text, referenceNow, timeZone);
      assert.equal(resolution?.source, 'weekday', sample.text);
      assert.equal(resolution?.weekdayIndex, sample.weekdayIndex, sample.text);
      assert.equal(resolution?.dayOffset, sample.dayOffset, sample.text);
    }
  });

  it('parses weekday and next-weekday phrases', () => {
    assert.equal(getZonedWeekdayIndex(referenceNow, timeZone), 4);

    const nextMonday = parseNaturalDayOffset('наступного понеділка', referenceNow, timeZone);
    assert.equal(nextMonday?.dayOffset, 4);
    assert.equal(nextMonday?.source, 'next_weekday');
    assert.equal(nextMonday?.weekdayIndex, 1);

    const onMondayRu = parseNaturalDayOffset('в понедельник', referenceNow, timeZone);
    assert.equal(onMondayRu?.dayOffset, 4);
    assert.equal(onMondayRu?.source, 'weekday');

    const onMondayUa = parseNaturalDayOffset('в понеділок', referenceNow, timeZone);
    assert.equal(onMondayUa?.dayOffset, 4);
    assert.equal(onMondayUa?.source, 'weekday');
  });

  it('strips natural date phrases from titles', () => {
    assert.equal(stripNaturalDatePhrases('прогулянку через годину'), 'прогулянку');
    assert.equal(stripNaturalDatePhrases('дзвінок післязавтра'), 'дзвінок');
    assert.equal(stripNaturalDatePhrases('зустріч наступного понеділка'), 'зустріч');
  });

  it('resolves create schedule for relative hour', () => {
    const schedule = parseCalendarCreateSchedule('Додай прогулянку через годину', referenceNow, timeZone);

    assert.equal(schedule.ok, true);

    if (!schedule.ok) {
      return;
    }

    const parts = getZonedTimeParts(new Date(schedule.startMs), timeZone);
    assert.equal(parts.hour, 13);
    assert.equal(parts.minute, 0);
    assert.equal(extractCreateEventTitle('Додай прогулянку через годину'), 'Прогулянка');
  });

  it('resolves create schedule for day-after-tomorrow with clock', () => {
    const schedule = parseCalendarCreateSchedule(
      'Заплануй дзвінок післязавтра о 15:00',
      referenceNow,
      timeZone,
    );

    assert.equal(schedule.ok, true);

    if (!schedule.ok) {
      return;
    }

    assert.equal(schedule.explicitDayOffset, 2);

    const parts = getZonedTimeParts(new Date(schedule.startMs), timeZone);
    assert.equal(parts.hour, 15);
    assert.equal(parts.minute, 0);

    const expectedYmd = addDaysToZonedYmd(getZonedYmd(referenceNow, timeZone), 2);
    const startYmd = getZonedYmd(new Date(schedule.startMs), timeZone);
    assert.equal(startYmd.day, expectedYmd.day);
    assert.equal(extractCreateEventTitle('Заплануй дзвінок післязавтра о 15:00'), 'Дзвінок');
  });

  it('resolves create schedule for next weekday with clock', () => {
    const schedule = parseCalendarCreateSchedule(
      'Створи зустріч наступного понеділка о 10:00',
      referenceNow,
      timeZone,
    );

    assert.equal(schedule.ok, true);

    if (!schedule.ok) {
      return;
    }

    const parts = getZonedTimeParts(new Date(schedule.startMs), timeZone);
    assert.equal(parts.hour, 10);
    assert.equal(parts.minute, 0);
    assert.equal(getZonedWeekdayIndex(new Date(schedule.startMs), timeZone), 1);
    assert.equal(extractCreateEventTitle('Створи зустріч наступного понеділка о 10:00'), 'Зустріч');
  });

  it('feeds resolveTargetDayContext with natural day offsets', () => {
    const day = resolveTargetDayContext('Удали встречу послезавтра в 19:30', referenceNow, timeZone);
    assert.equal(day.dayOffset, 2);

    const weekendDay = resolveTargetDayContext('на выходных в 11:00', referenceNow, timeZone);
    assert.equal(weekendDay.dayOffset, 2);
  });

  it('computes day offset from instant relative to reference', () => {
    const plusTwoDays = referenceNow.getTime() + 2 * 24 * 60 * 60_000;
    assert.equal(computeDayOffsetFromInstant(referenceNow, plusTwoDays, timeZone), 2);
  });
});
