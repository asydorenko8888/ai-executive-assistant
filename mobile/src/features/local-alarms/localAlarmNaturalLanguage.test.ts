import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { isLocalAlarmIntent } from '@/src/features/local-alarms/localAlarmClassification';
import { parseLocalAlarmIntent } from '@/src/features/local-alarms/localAlarmIntentParser';
import { resetLocalAlarmsForTests } from '@/src/features/local-alarms/localAlarmRuntimeStore';
import { resolveLocalAlarmTurn } from '@/src/features/local-alarms/resolveLocalAlarmTurn';

const referenceNow = new Date('2026-05-28T22:00:00-05:00');

type AlarmPhraseCase = {
  transcript: string;
  expectedHour: number;
  expectedMinute: number;
  dayOffset: number;
  languageCode?: 'en-US' | 'ru-RU' | 'uk-UA';
};

const TOMORROW_6AM_CASES: AlarmPhraseCase[] = [
  {
    transcript: 'Set alarm for 6 AM tomorrow',
    expectedHour: 6,
    expectedMinute: 0,
    dayOffset: 1,
    languageCode: 'en-US',
  },
  {
    transcript: 'Wake me up at 6 AM tomorrow',
    expectedHour: 6,
    expectedMinute: 0,
    dayOffset: 1,
    languageCode: 'en-US',
  },
  {
    transcript: 'Wake me tomorrow at six',
    expectedHour: 6,
    expectedMinute: 0,
    dayOffset: 1,
    languageCode: 'en-US',
  },
  {
    transcript: 'Alarm tomorrow 6 AM',
    expectedHour: 6,
    expectedMinute: 0,
    dayOffset: 1,
    languageCode: 'en-US',
  },
  {
    transcript: 'Set an alarm for tomorrow at 6:00 AM',
    expectedHour: 6,
    expectedMinute: 0,
    dayOffset: 1,
    languageCode: 'en-US',
  },
  {
    transcript: 'Wake me up tomorrow morning at 6',
    expectedHour: 6,
    expectedMinute: 0,
    dayOffset: 1,
    languageCode: 'en-US',
  },
  {
    transcript: 'Разбуди меня завтра в шесть утра',
    expectedHour: 6,
    expectedMinute: 0,
    dayOffset: 1,
    languageCode: 'ru-RU',
  },
  {
    transcript: 'Постав будильник завтра на 6 утра',
    expectedHour: 6,
    expectedMinute: 0,
    dayOffset: 1,
    languageCode: 'ru-RU',
  },
  {
    transcript: 'Будильник на завтра 6 утра',
    expectedHour: 6,
    expectedMinute: 0,
    dayOffset: 1,
    languageCode: 'ru-RU',
  },
  {
    transcript: 'Поставь будильник на завтра в 6 утра',
    expectedHour: 6,
    expectedMinute: 0,
    dayOffset: 1,
    languageCode: 'ru-RU',
  },
  {
    transcript: 'Разбуди меня завтра в 6:00',
    expectedHour: 6,
    expectedMinute: 0,
    dayOffset: 1,
    languageCode: 'ru-RU',
  },
  {
    transcript: 'Постав будильник завтра на шесть утра',
    expectedHour: 6,
    expectedMinute: 0,
    dayOffset: 1,
    languageCode: 'ru-RU',
  },
  {
    transcript: 'будильник завтра 6 утра',
    expectedHour: 6,
    expectedMinute: 0,
    dayOffset: 1,
    languageCode: 'ru-RU',
  },
  {
    transcript: 'Розбуди мене завтра о шість ранку',
    expectedHour: 6,
    expectedMinute: 0,
    dayOffset: 1,
    languageCode: 'uk-UA',
  },
  {
    transcript: 'Постав будильник на 7 утра',
    expectedHour: 7,
    expectedMinute: 0,
    dayOffset: 1,
    languageCode: 'ru-RU',
  },
  {
    transcript: 'Wake me at 7 AM',
    expectedHour: 7,
    expectedMinute: 0,
    dayOffset: 1,
    languageCode: 'en-US',
  },
  {
    transcript: 'Set alarm at 6:30 tomorrow',
    expectedHour: 6,
    expectedMinute: 30,
    dayOffset: 1,
    languageCode: 'en-US',
  },
  {
    transcript: 'Alarm for tomorrow 6:30 AM',
    expectedHour: 6,
    expectedMinute: 30,
    dayOffset: 1,
    languageCode: 'en-US',
  },
  {
    transcript: 'Разбуди меня завтра в 6 30',
    expectedHour: 6,
    expectedMinute: 30,
    dayOffset: 1,
    languageCode: 'ru-RU',
  },
  {
    transcript: 'Поставь будильник через 15 минут',
    expectedHour: 22,
    expectedMinute: 15,
    dayOffset: 0,
    languageCode: 'ru-RU',
  },
  {
    transcript: 'Set alarm in 10 minutes',
    expectedHour: 22,
    expectedMinute: 10,
    dayOffset: 0,
    languageCode: 'en-US',
  },
  {
    transcript: 'wake me up at 6 am tomorrow please',
    expectedHour: 6,
    expectedMinute: 0,
    dayOffset: 1,
    languageCode: 'en-US',
  },
];

function assertTriggerMatches(
  triggerAt: Date,
  expected: Pick<AlarmPhraseCase, 'expectedHour' | 'expectedMinute' | 'dayOffset'>,
  transcript: string,
) {
  const expectedDate = new Date(referenceNow);
  expectedDate.setDate(expectedDate.getDate() + expected.dayOffset);
  expectedDate.setHours(expected.expectedHour, expected.expectedMinute, 0, 0);

  assert.equal(triggerAt.getHours(), expected.expectedHour, `${transcript}: hour`);
  assert.equal(triggerAt.getMinutes(), expected.expectedMinute, `${transcript}: minute`);
  assert.equal(triggerAt.getDate(), expectedDate.getDate(), `${transcript}: day`);
  assert.ok(triggerAt.getTime() > referenceNow.getTime(), `${transcript}: must be in future`);
}

describe('alarm natural language phrases', () => {
  afterEach(() => {
    resetLocalAlarmsForTests();
  });

  for (const testCase of TOMORROW_6AM_CASES) {
    it(`detects and parses: ${testCase.transcript}`, () => {
      assert.equal(isLocalAlarmIntent(testCase.transcript), true, 'intent');

      const intent = parseLocalAlarmIntent(testCase.transcript, referenceNow);

      assert.equal(intent?.kind, 'create', 'parsed kind');

      if (intent?.kind !== 'create') {
        return;
      }

      assertTriggerMatches(intent.triggerAt, testCase, testCase.transcript);

      const result = resolveLocalAlarmTurn({
        transcript: testCase.transcript,
        languageCode: testCase.languageCode ?? 'en-US',
        referenceNow,
      });

      assert.ok(result?.reply, 'confirmation reply');
      assert.match(result?.reply ?? '', /6:0[0-9]|06:0[0-9]|6\s*AM|6\s*утра|6:30|06:30|минут|minutes|утра|tomorrow|завтра/i);
    });
  }
});
