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
import { isOperationalCalendarCreateRequest } from '@/src/features/agent/intent/operationalCalendarWriteDetection';
import { getZonedTimeParts, getZonedYmd, addDaysToZonedYmd } from '@/src/features/agent/calendar/calendarTimezone';

const referenceNow = new Date('2026-05-28T12:00:00-05:00');
const timeZone = 'America/Chicago';

const CREATE_SAMPLES = [
  {
    transcript: 'Добавь спортзал сегодня в 18:00',
    title: 'Спортзал',
    hour: 18,
    minute: 0,
    dayOffset: 0,
  },
  {
    transcript: 'Запланируй встречу с Иваном завтра в 15:30',
    title: 'Встреча с Иваном',
    hour: 15,
    minute: 30,
    dayOffset: 1,
  },
  {
    transcript: 'Додай чаювання сьогодні о 17:30',
    title: 'Чаювання',
    hour: 17,
    minute: 30,
    dayOffset: 0,
  },
  {
    transcript: 'Створи подію вечеря завтра на 19:00',
    title: 'Вечеря',
    hour: 19,
    minute: 0,
    dayOffset: 1,
  },
  {
    transcript: 'Поставь звонок Николаю сегодня в 20:00',
    title: 'Звонок Николаю',
    hour: 20,
    minute: 0,
    dayOffset: 0,
  },
];

const TITLE_BUG_FIX_SAMPLES = [
  {
    transcript: 'Добавь прогулку сегодня в 20:00',
    title: 'Прогулка',
  },
  {
    transcript: 'додай каву завтра в 9:30 ранку',
    title: 'Кава',
  },
  {
    transcript: 'запланируй звонок Сергею сегодня в 20:00',
    title: 'Звонок Сергею',
  },
  {
    transcript: 'створи зустріч з інвестором завтра о 15:00',
    title: 'Зустріч з інвестором',
  },
];

const ENGLISH_TITLE_SAMPLES = [
  {
    transcript: 'Add a walk today at 8:00 PM',
    title: 'Walk',
  },
  {
    transcript: 'Schedule a meeting with an investor tomorrow at 3:30 PM',
    title: 'Meeting with Investor',
  },
  {
    transcript: 'Create a call with Sergey today at 6:00 PM',
    title: 'Call with Sergey',
  },
  {
    transcript: 'Add grocery shopping on Friday at 7:00 PM',
    title: 'Grocery Shopping',
  },
  {
    transcript: 'Add coffee in one hour',
    title: 'Coffee',
  },
  {
    transcript: 'Create a walk after 15 minutes',
    title: 'Walk',
  },
];

const BAD_TITLE_PREVENTION_SAMPLES = [
  { transcript: 'Add a walk today at 8:00 PM', forbidden: /\b(at|today|pm)\b/i },
  { transcript: 'Add coffee in one hour', forbidden: /\b(in|hour)\b/i },
  { transcript: 'Add grocery shopping on Friday at 7:00 PM', forbidden: /\b(on|friday|at)\b/i },
  { transcript: 'Create a walk after 15 minutes', forbidden: /\b(after|minutes)\b/i },
];

describe('calendar create integration', () => {
  it('extracts clean English titles without schedule words', () => {
    for (const sample of ENGLISH_TITLE_SAMPLES) {
      assert.equal(extractCreateEventTitle(sample.transcript), sample.title, sample.transcript);
    }
  });

  it('never leaves date or time residue in extracted titles', () => {
    for (const sample of BAD_TITLE_PREVENTION_SAMPLES) {
      const title = extractCreateEventTitle(sample.transcript);
      assert.ok(title, sample.transcript);
      assert.doesNotMatch(title ?? '', sample.forbidden, sample.transcript);
    }
  });

  it('extracts nominative titles from accusative RU/UA phrases', () => {
    for (const sample of TITLE_BUG_FIX_SAMPLES) {
      assert.equal(extractCreateEventTitle(sample.transcript), sample.title, sample.transcript);
    }
  });

  it('strips conversational filler and create verbs from title', () => {
    assert.equal(
      extractCreateEventTitle('Совсем забыл, добавь звонок Николаю сегодня на 5 вечера'),
      'Звонок Николаю',
    );
    assert.equal(
      extractCreateEventTitle('Ой, кстати, поставь встречу с Анной завтра в 10 утра'),
      'Встреча с Анной',
    );
    assert.equal(
      extractCreateEventTitle('Чуть не забыл, створи каву завтра о 9:00'),
      'Кава',
    );
    assert.equal(
      extractCreateEventTitle('У меня отлично. Добавь на 7 вечера прогулку.'),
      'Прогулка',
    );
    assert.equal(
      extractCreateEventTitle('Привет, у меня отлично. Добавь прогулку на 7 вечера.'),
      'Прогулка',
    );
  });

  it('does not leak previous user message into title when titleSource is current message only', () => {
    const previousCommand = 'Добавь прогулку сегодня в 20:00';
    const currentCommand = 'додай каву завтра в 9:30 ранку';
    const mergedTranscript = `${previousCommand} ${currentCommand}`;

    assert.equal(extractCreateEventTitle(currentCommand), 'Кава');

    const extraction = extractCalendarCommand({
      transcript: mergedTranscript,
      titleSourceTranscript: currentCommand,
      referenceNow,
    });

    assert.equal(extraction.title, 'Кава');
    assert.ok(isCalendarExtractionExecutable(extraction));
  });

  it('strips meridiem words left after clock removal', () => {
    assert.equal(extractCreateEventTitle('додай каву завтра в 9:30 ранку'), 'Кава');
    assert.doesNotMatch(extractCreateEventTitle('додай каву завтра в 9:30 ранку') ?? '', /ранку/i);
  });

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
        titleSourceTranscript: sample.transcript,
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
      titleSourceTranscript: 'Добавь спортзал сегодня в 18:00',
      referenceNow,
    });

    assert.equal(complete.title, 'Спортзал');
    assert.ok(isCalendarExtractionExecutable(complete));

    const missingTime = extractCalendarCommand({
      transcript: 'Добавь спортзал сегодня',
      titleSourceTranscript: 'Добавь спортзал сегодня',
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
