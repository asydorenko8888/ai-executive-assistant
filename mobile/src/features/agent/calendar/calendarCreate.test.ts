import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { detectCalendarCommandIntent } from '@/src/features/agent/calendar/calendarCommandTypes';
import { extractCreateEventTitle } from '@/src/features/agent/calendar/calendarCreateIntentExtractor';
import { parseCalendarCreateSchedule } from '@/src/features/agent/calendar/calendarCreateScheduleParser';
import {
  extractCalendarCommand,
  isCalendarExtractionExecutable,
} from '@/src/features/agent/calendar/calendarCommandExtractor';
import { createCalendarToolSuccess } from '@/src/features/agent/execution/calendarToolContract';
import { getZonedTimeParts, getZonedYmd, addDaysToZonedYmd } from '@/src/features/agent/calendar/calendarTimezone';
import { isOperationalCalendarCreateRequest } from '@/src/features/agent/intent/operationalCalendarWriteDetection';

const referenceNow = new Date('2026-05-28T12:00:00-05:00');
const timeZone = 'America/Chicago';

const CREATE_SAMPLES = [
  {
    transcript: 'Добавь спортзал сегодня в 18:00',
    title: 'Спортзал',
    hour: 18,
    minute: 0,
    dayOffset: 0,
    locale: 'ru-RU' as const,
  },
  {
    transcript: 'Запланируй встречу с Иваном завтра в 15:30',
    title: 'Встреча с Иваном',
    hour: 15,
    minute: 30,
    dayOffset: 1,
    locale: 'ru-RU' as const,
  },
  {
    transcript: 'Додай чаювання сьогодні о 17:30',
    title: 'Чаювання',
    hour: 17,
    minute: 30,
    dayOffset: 0,
    locale: 'uk-UA' as const,
  },
  {
    transcript: 'Створи подію вечеря завтра на 19:00',
    title: 'Вечеря',
    hour: 19,
    minute: 0,
    dayOffset: 1,
    locale: 'uk-UA' as const,
  },
  {
    transcript: 'Поставь звонок Николаю сегодня в 20:00',
    title: 'Звонок Николаю',
    hour: 20,
    minute: 0,
    dayOffset: 0,
    locale: 'ru-RU' as const,
  },
];

describe('calendar create integration', () => {
  it('detects RU and UA create intents', () => {
    for (const sample of CREATE_SAMPLES) {
      assert.equal(isOperationalCalendarCreateRequest(sample.transcript), true, sample.transcript);
      assert.equal(detectCalendarCommandIntent(sample.transcript), 'create_calendar_event', sample.transcript);
    }
  });

  it('extracts titles from natural RU and UA create phrases', () => {
    for (const sample of CREATE_SAMPLES) {
      assert.equal(extractCreateEventTitle(sample.transcript), sample.title, sample.transcript);
    }
  });

  it('parses start time and day offset for create phrases', () => {
    for (const sample of CREATE_SAMPLES) {
      const schedule = parseCalendarCreateSchedule(sample.transcript, referenceNow, timeZone);
      assert.equal(schedule.ok, true, sample.transcript);

      if (!schedule.ok) {
        continue;
      }

      assert.equal(schedule.explicitDayOffset, sample.dayOffset, sample.transcript);
      assert.equal(schedule.hasExplicitTime, true, sample.transcript);

      const startParts = getZonedTimeParts(new Date(schedule.startMs), timeZone);
      assert.equal(startParts.hour, sample.hour, sample.transcript);
      assert.equal(startParts.minute, sample.minute, sample.transcript);

      const referenceYmd = getZonedYmd(referenceNow, timeZone);
      const expectedYmd = addDaysToZonedYmd(referenceYmd, sample.dayOffset);
      const startYmd = getZonedYmd(new Date(schedule.startMs), timeZone);
      assert.equal(startYmd.year, expectedYmd.year, sample.transcript);
      assert.equal(startYmd.month, expectedYmd.month, sample.transcript);
      assert.equal(startYmd.day, expectedYmd.day, sample.transcript);
      assert.equal(schedule.endMs - schedule.startMs, 60 * 60 * 1000);

      const extraction = extractCalendarCommand({
        transcript: sample.transcript,
        referenceNow,
      });

      assert.equal(extraction.title, sample.title, sample.transcript);
      assert.ok(isCalendarExtractionExecutable(extraction), sample.transcript);
    }
  });

  it('defaults create duration to one hour when end time is absent', () => {
    const schedule = parseCalendarCreateSchedule('Добавь спортзал сегодня в 18:00', referenceNow, timeZone);

    assert.equal(schedule.ok, true);

    if (!schedule.ok) {
      return;
    }

    assert.equal(schedule.endMs - schedule.startMs, 60 * 60 * 1000);
  });

  it('marks extraction executable only with title and explicit time', () => {
    const complete = extractCalendarCommand({
      transcript: 'Добавь спортзал сегодня в 18:00',
      referenceNow,
    });

    assert.equal(complete.title, 'Спортзал');
    assert.ok(isCalendarExtractionExecutable(complete));

    const missingTime = extractCalendarCommand({
      transcript: 'Добавь спортзал сегодня',
      referenceNow,
    });

    assert.equal(isCalendarExtractionExecutable(missingTime), false);
  });

  it('requires verified tool contract fields for success', () => {
    const tool = createCalendarToolSuccess({
      id: 'evt-gym',
      summary: 'Спортзал',
      startsAt: '2026-05-28T18:00:00-05:00',
      endsAt: '2026-05-28T19:00:00-05:00',
    });

    assert.equal(tool.status, 'SUCCESS');
    assert.equal(tool.verified, true);
    assert.equal(tool.verificationFetched, true);
    assert.ok(tool.event);
  });
});
