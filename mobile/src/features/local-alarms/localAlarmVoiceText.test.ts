import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { buildActiveAlarmSession } from '@/src/features/local-alarms/localAlarmSession';
import {
  getLocalAlarmById,
  listDueLocalAlarms,
  resetLocalAlarmsForTests,
  snoozeLocalAlarm,
} from '@/src/features/local-alarms/localAlarmRuntimeStore';
import {
  buildLocalAlarmVoiceText,
  formatAlarmOriginalTime,
  resolveAlarmVoiceLanguage,
} from '@/src/features/local-alarms/localAlarmVoiceText';
import { resolveLocalAlarmTurn } from '@/src/features/local-alarms/resolveLocalAlarmTurn';

const TEST_TRANSCRIPT = 'Поставь будильник через 2 минуты';

function captureConsoleError() {
  const entries: unknown[][] = [];
  const original = console.error;

  console.error = (...args: unknown[]) => {
    entries.push(args);
  };

  return {
    entries,
    restore() {
      console.error = original;
    },
  };
}

describe('local alarm voice text by snooze count', () => {
  afterEach(() => {
    resetLocalAlarmsForTests();
  });

  it('escalates Russian voice phrases across three trigger cycles', () => {
    const referenceNow = new Date('2026-05-28T10:00:00+03:00');
    const firstTriggerAt = referenceNow.getTime() + 2 * 60_000;

    resolveLocalAlarmTurn({
      transcript: TEST_TRANSCRIPT,
      languageCode: 'ru-RU',
      referenceNow,
    });

    let alarm = listDueLocalAlarms(firstTriggerAt)[0]!;

    assert.equal(alarm.snoozeCount, 0);

    const firstSession = buildActiveAlarmSession(alarm, 'ru-RU');

    assert.equal(firstSession.message, 'Будильник: Будильник.');
    assert.equal(
      firstSession.voiceText,
      `Андрей, ты просил разбудить тебя в ${formatAlarmOriginalTime(alarm.originalTriggerAtMs, 'ru')}.`,
    );

    snoozeLocalAlarm(alarm.id, 5, firstTriggerAt);
    alarm = getLocalAlarmById(alarm.id)!;

    assert.equal(alarm.snoozeCount, 1);

    const secondSession = buildActiveAlarmSession(alarm, 'ru-RU');

    assert.equal(secondSession.voiceText, 'Андрей, вставай. Иначе я потеряю терпение.');

    snoozeLocalAlarm(alarm.id, 5, firstTriggerAt + 5 * 60_000);
    alarm = getLocalAlarmById(alarm.id)!;

    assert.equal(alarm.snoozeCount, 2);

    const thirdSession = buildActiveAlarmSession(alarm, 'ru-RU');

    assert.equal(thirdSession.voiceText, 'Тряпка, будь мужиком. Вставай.');

    snoozeLocalAlarm(alarm.id, 5, firstTriggerAt + 10 * 60_000);
    alarm = getLocalAlarmById(alarm.id)!;

    assert.equal(alarm.snoozeCount, 3);
    assert.equal(buildLocalAlarmVoiceText(alarm, 'ru-RU'), 'Тряпка, будь мужиком. Вставай.');
  });

  it('uses Ukrainian and English templates', () => {
    const referenceNow = new Date('2026-05-28T10:00:00+03:00');
    const firstTriggerAt = referenceNow.getTime() + 2 * 60_000;

    resolveLocalAlarmTurn({
      transcript: TEST_TRANSCRIPT,
      languageCode: 'uk-UA',
      referenceNow,
    });

    const alarm = listDueLocalAlarms(firstTriggerAt)[0]!;

    assert.equal(
      buildLocalAlarmVoiceText(alarm, 'uk-UA'),
      `Андрію, ти просив розбудити тебе о ${formatAlarmOriginalTime(alarm.originalTriggerAtMs, 'uk')}.`,
    );

    assert.equal(
      buildLocalAlarmVoiceText({ ...alarm, snoozeCount: 1 }, 'en-US'),
      "Andrii, get up. Otherwise I'm going to lose my patience.",
    );

    assert.equal(
      buildLocalAlarmVoiceText({ ...alarm, snoozeCount: 2 }, 'en-US'),
      'Quit being soft. Be a man. Get up.',
    );
  });

  it('logs localized voice selection and snooze increment', () => {
    const logs = captureConsoleError();
    const referenceNow = new Date('2026-05-28T10:00:00+03:00');
    const firstTriggerAt = referenceNow.getTime() + 2 * 60_000;

    try {
      resolveLocalAlarmTurn({
        transcript: TEST_TRANSCRIPT,
        languageCode: 'ru-RU',
        referenceNow,
      });

      const alarm = listDueLocalAlarms(firstTriggerAt)[0]!;

      buildActiveAlarmSession(alarm, 'ru-RU');
      snoozeLocalAlarm(alarm.id, 5, firstTriggerAt);

      const localizedLog = logs.entries.find((entry) => entry[0] === 'ALARM_VOICE_LOCALIZED');
      const incrementLog = logs.entries.find((entry) => entry[0] === 'ALARM_SNOOZE_COUNT_INCREMENTED');

      assert.ok(localizedLog);
      assert.equal((localizedLog?.[1] as { language?: string }).language, 'ru');
      assert.equal((localizedLog?.[1] as { snoozeCount?: number }).snoozeCount, 0);
      assert.ok(incrementLog);
      assert.equal((incrementLog?.[1] as { snoozeCount?: number }).snoozeCount, 1);
      assert.equal(resolveAlarmVoiceLanguage('uk-UA'), 'uk');
      assert.equal(resolveAlarmVoiceLanguage('ru-RU'), 'ru');
      assert.equal(resolveAlarmVoiceLanguage('en-US'), 'en');
    } finally {
      logs.restore();
    }
  });
});
