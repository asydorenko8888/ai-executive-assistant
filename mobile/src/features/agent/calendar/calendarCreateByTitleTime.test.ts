import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isCalendarCreateByTitleTimePattern } from '@/src/features/agent/calendar/calendarCreateByTitleTime';
import { parseCalendarCreateSchedule } from '@/src/features/agent/calendar/calendarCreateScheduleParser';
import { parseCalendarPointSchedule } from '@/src/features/agent/calendarIntelligence/calendarClockParser';
import { extractCreateEventTitle } from '@/src/features/agent/calendar/calendarCreateIntentExtractor';
import { isOperationalCalendarCreateRequest } from '@/src/features/agent/intent/operationalCalendarWriteDetection';
import { parseSpokenTimeFragment } from '@/src/features/agent/calendar/calendarSpokenTime';

const referenceNow = new Date('2026-06-01T10:00:00-05:00');

describe('calendar create by title and time', () => {
  it('detects implicit create without add verb', () => {
    assert.equal(isOperationalCalendarCreateRequest('переговоры на четыре вечера'), true);
    assert.equal(isCalendarCreateByTitleTimePattern('переговоры на четыре вечера'), true);
    assert.equal(isOperationalCalendarCreateRequest('встреча с инвестором завтра в 15:30'), true);
    assert.equal(isOperationalCalendarCreateRequest('ужин в семь вечера'), true);
    assert.equal(isOperationalCalendarCreateRequest('забрать детей на 14:30'), true);
  });

  it('parses spoken evening for add and implicit create', () => {
    for (const transcript of [
      'Добавь переговоры на четыре вечера',
      'переговоры на четыре вечера',
      'Добавь прогулку на 8 вечера',
    ]) {
      const schedule = parseCalendarCreateSchedule(transcript, referenceNow);

      assert.equal(schedule.ok, true, transcript);

      if (transcript.includes('четыре')) {
        const parsed = parseCalendarPointSchedule(transcript, referenceNow);
        assert.equal(parsed.ok, true, transcript);
      }
    }
  });

  it('parses 4 вечера and о четыре вечера as evening hours', () => {
    assert.equal(parseSpokenTimeFragment('на 4 вечера'), '16:00');
    assert.equal(parseSpokenTimeFragment('о четыре вечера'), '16:00');
    assert.equal(parseSpokenTimeFragment('на семь вечера'), '19:00');
    assert.equal(parseSpokenTimeFragment('на восемь вечера'), '20:00');
  });

  it('extracts title after stripping spoken time', () => {
    const title = extractCreateEventTitle('переговоры на четыре вечера');

    assert.match(title ?? '', /переговор/i);
  });
});
