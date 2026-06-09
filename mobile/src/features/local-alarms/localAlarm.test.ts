import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { isOperationalCalendarWriteRequest } from '@/src/features/agent/intent/operationalCalendarWriteDetection';
import {
  isLocalAlarmIntent,
} from '@/src/features/local-alarms/localAlarmClassification';
import { isLocalReminderIntent } from '@/src/features/local-reminders/localReminderClassification';
import { parseLocalAlarmIntent } from '@/src/features/local-alarms/localAlarmIntentParser';
import {
  logAlarmRepeat,
  logAlarmSnoozed,
  logAlarmStarted,
  logAlarmStopped,
} from '@/src/features/local-alarms/localAlarmMarkers';
import { buildActiveAlarmSession } from '@/src/features/local-alarms/localAlarmSession';
import {
  getLocalAlarmById,
  listDueLocalAlarms,
  listScheduledLocalAlarms,
  resetLocalAlarmsForTests,
  snoozeLocalAlarm,
  stopLocalAlarm,
} from '@/src/features/local-alarms/localAlarmRuntimeStore';
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

describe('local alarm classification', () => {
  it('detects alarm create phrases and excludes reminders', () => {
    assert.equal(isLocalAlarmIntent(TEST_TRANSCRIPT), true);
    assert.equal(isLocalAlarmIntent('Поставь будильник на 7 утра'), true);
    assert.equal(isLocalAlarmIntent('Разбуди меня завтра в 8:30'), true);
    assert.equal(isLocalAlarmIntent('Поставь будильник через 6 минут 30 секунд'), true);
    assert.equal(isLocalAlarmIntent('разбуди меня в 18:50'), true);
    assert.equal(isLocalAlarmIntent('поставь будильник на 18:50'), true);
    assert.equal(isLocalAlarmIntent('розбуди мене о 18:50'), true);
    assert.equal(isLocalAlarmIntent('постав будильник на 18:50'), true);
    assert.equal(isLocalReminderIntent('Напомни мне через 2 минуты выпить воду'), true);
    assert.equal(isLocalReminderIntent(TEST_TRANSCRIPT), false);
    assert.equal(isLocalReminderIntent('разбуди меня в 18:50'), false);
    assert.equal(isLocalReminderIntent('розбуди мене о 18:50'), false);
  });

  it('excludes alarms from calendar write detection', () => {
    assert.equal(isOperationalCalendarWriteRequest(TEST_TRANSCRIPT), false);
    assert.equal(isOperationalCalendarWriteRequest('Поставь будильник на 7 утра'), false);
  });
});

describe('local alarm intent parser', () => {
  const referenceNow = new Date('2026-05-28T10:00:00+03:00');

  it('parses relative alarm', () => {
    const intent = parseLocalAlarmIntent(TEST_TRANSCRIPT, referenceNow);

    assert.equal(intent?.kind, 'create');

    if (intent?.kind !== 'create') {
      return;
    }

    assert.equal(intent.title, 'Будильник');
    assert.equal(intent.requestedDelayMs, 2 * 60_000);
    assert.equal(intent.triggerAt.getTime(), referenceNow.getTime() + 2 * 60_000);
  });

  it('parses absolute alarm at 7 утра', () => {
    const intent = parseLocalAlarmIntent('Поставь будильник на 7 утра', referenceNow);

    assert.equal(intent?.kind, 'create');

    if (intent?.kind !== 'create') {
      return;
    }

    assert.equal(intent.triggerAt.getHours(), 7);
    assert.equal(intent.triggerAt.getMinutes(), 0);
  });

  it('parses RU and UA absolute alarm clock phrases', () => {
    for (const transcript of [
      'разбуди меня в 18:50',
      'поставь будильник на 18:50',
      'розбуди мене о 18:50',
      'постав будильник на 18:50',
      'разбуди меня в 18 50',
    ]) {
      const intent = parseLocalAlarmIntent(transcript, referenceNow);
      assert.equal(intent?.kind, 'create', transcript);

      if (intent?.kind !== 'create') {
        continue;
      }

      assert.equal(intent.triggerAt.getHours(), 18, transcript);
      assert.equal(intent.triggerAt.getMinutes(), 50, transcript);
    }
  });

  it('parses wake me tomorrow at 8:30', () => {
    const intent = parseLocalAlarmIntent('Разбуди меня завтра в 8:30', referenceNow);

    assert.equal(intent?.kind, 'create');

    if (intent?.kind !== 'create') {
      return;
    }

    assert.equal(intent.triggerAt.getHours(), 8);
    assert.equal(intent.triggerAt.getMinutes(), 30);
    assert.equal(intent.triggerAt.getDate(), referenceNow.getDate() + 1);
  });
});

describe('local alarm runtime flow', () => {
  afterEach(() => {
    resetLocalAlarmsForTests();
  });

  it('creates alarm and confirms exact parsed delay', () => {
    const logs = captureConsoleError();
    const referenceNow = new Date('2026-05-28T10:00:00+03:00');

    try {
      const result = resolveLocalAlarmTurn({
        transcript: TEST_TRANSCRIPT,
        languageCode: 'ru-RU',
        referenceNow,
      });

      assert.equal(result?.reply, 'Хорошо. Будильник через 2 минуты.');
      assert.equal(listScheduledLocalAlarms(referenceNow.getTime()).length, 1);

      const createdLog = logs.entries.find((entry) => entry[0] === 'LOCAL_ALARM_CREATED');
      const confirmationLog = logs.entries.find((entry) => entry[0] === 'LOCAL_ALARM_CONFIRMATION_BUILT');

      assert.ok(createdLog);
      assert.ok(confirmationLog);
      assert.equal((confirmationLog?.[1] as { requestedDelayMs?: number }).requestedDelayMs, 2 * 60_000);
    } finally {
      logs.restore();
    }
  });

  it('logs alarm session lifecycle markers for stop and snooze', () => {
    const logs = captureConsoleError();
    const referenceNow = new Date('2026-05-28T10:00:00+03:00');

    try {
      resolveLocalAlarmTurn({
        transcript: TEST_TRANSCRIPT,
        languageCode: 'ru-RU',
        referenceNow,
      });

      const due = listDueLocalAlarms(referenceNow.getTime() + 2 * 60_000);

      assert.equal(due.length, 1);

      const session = buildActiveAlarmSession(due[0]!, 'ru-RU');

      logAlarmStarted({ id: session.alarmId, title: session.title });
      logAlarmRepeat({ id: session.alarmId, title: session.title });
      stopLocalAlarm(session.alarmId);
      logAlarmStopped({ id: session.alarmId, title: session.title });

      resolveLocalAlarmTurn({
        transcript: TEST_TRANSCRIPT,
        languageCode: 'ru-RU',
        referenceNow,
      });

      const dueAgain = listDueLocalAlarms(referenceNow.getTime() + 2 * 60_000);
      snoozeLocalAlarm(dueAgain[0]!.id, 5, referenceNow.getTime() + 2 * 60_000);
      logAlarmSnoozed({
        id: dueAgain[0]!.id,
        title: dueAgain[0]!.title,
        snoozeMinutes: 5,
      });

      assert.ok(logs.entries.find((entry) => entry[0] === 'ALARM_STARTED'));
      assert.ok(logs.entries.find((entry) => entry[0] === 'ALARM_REPEAT'));
      assert.ok(logs.entries.find((entry) => entry[0] === 'ALARM_STOPPED'));
      assert.ok(logs.entries.find((entry) => entry[0] === 'ALARM_SNOOZED'));
      assert.equal(getLocalAlarmById(session.alarmId)?.status, 'stopped');
    } finally {
      logs.restore();
    }
  });
});
