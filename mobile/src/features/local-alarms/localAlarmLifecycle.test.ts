import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { isOperationalCalendarWriteRequest } from '@/src/features/agent/intent/operationalCalendarWriteDetection';
import {
  isLocalAlarmCancelQuery,
  isLocalAlarmIntent,
  isLocalAlarmRescheduleQuery,
} from '@/src/features/local-alarms/localAlarmClassification';
import { parseLocalAlarmIntent } from '@/src/features/local-alarms/localAlarmIntentParser';
import {
  resetPendingLocalAlarmActionForTests,
} from '@/src/features/local-alarms/localAlarmPendingAction';
import {
  listScheduledLocalAlarms,
  resetLocalAlarmsForTests,
} from '@/src/features/local-alarms/localAlarmRuntimeStore';
import {
  matchAlarmsByTimeSelector,
  parseAlarmSelectorTime,
} from '@/src/features/local-alarms/localAlarmTimeMatch';
import { resolveLocalAlarmTurn } from '@/src/features/local-alarms/resolveLocalAlarmTurn';

const referenceNow = new Date('2026-05-28T14:00:00+03:00');

function createAlarmAt16() {
  return resolveLocalAlarmTurn({
    transcript: 'Разбуди меня в 16:00',
    languageCode: 'ru-RU',
    referenceNow,
  });
}

function addSecondAlarmTomorrow6am() {
  const pending = resolveLocalAlarmTurn({
    transcript: 'Разбуди меня завтра в 6 утра',
    languageCode: 'ru-RU',
    referenceNow,
  });

  if (/уже есть активный|Оставить его и добавить/i.test(pending?.reply ?? '')) {
    return resolveLocalAlarmTurn({
      transcript: 'Да',
      languageCode: 'ru-RU',
      referenceNow,
    });
  }

  return pending;
}

describe('alarm lifecycle', () => {
  afterEach(() => {
    resetLocalAlarmsForTests();
    resetPendingLocalAlarmActionForTests();
  });

  it('creates alarm at 16:00', () => {
    const result = createAlarmAt16();

    assert.match(result?.reply ?? '', /16:00/);
    assert.equal(listScheduledLocalAlarms(referenceNow.getTime()).length, 1);
  });

  it('deletes alarm by exact time phrase "16 часов"', () => {
    createAlarmAt16();

    const result = resolveLocalAlarmTurn({
      transcript: 'Удали будильник на 16 часов',
      languageCode: 'ru-RU',
      referenceNow,
    });

    assert.match(result?.reply ?? '', /16:00/);
    assert.match(result?.reply ?? '', /удалён/i);
    assert.equal(listScheduledLocalAlarms(referenceNow.getTime()).length, 0);
  });

  it('deletes the only active alarm without a time selector', () => {
    createAlarmAt16();

    const result = resolveLocalAlarmTurn({
      transcript: 'Удали будильник',
      languageCode: 'ru-RU',
      referenceNow,
    });

    assert.match(result?.reply ?? '', /удалён/i);
    assert.equal(listScheduledLocalAlarms(referenceNow.getTime()).length, 0);
  });

  it('cancels the only active alarm without a time selector', () => {
    createAlarmAt16();

    const result = resolveLocalAlarmTurn({
      transcript: 'Отмени будильник',
      languageCode: 'ru-RU',
      referenceNow,
    });

    assert.match(result?.reply ?? '', /удалён/i);
    assert.equal(listScheduledLocalAlarms(referenceNow.getTime()).length, 0);
  });

  it('reschedules alarm by exact target time when only one alarm exists', () => {
    createAlarmAt16();

    const result = resolveLocalAlarmTurn({
      transcript: 'Перенеси будильник на 15:30',
      languageCode: 'ru-RU',
      referenceNow,
    });

    assert.match(result?.reply ?? '', /15:30/);
    assert.equal(listScheduledLocalAlarms(referenceNow.getTime()).length, 1);
    assert.equal(
      new Date(listScheduledLocalAlarms(referenceNow.getTime())[0]!.triggerAtMs).getHours(),
      15,
    );
    assert.equal(
      new Date(listScheduledLocalAlarms(referenceNow.getTime())[0]!.triggerAtMs).getMinutes(),
      30,
    );
  });

  it('reschedules alarm when only one alarm exists and command uses dot time', () => {
    createAlarmAt16();

    const result = resolveLocalAlarmTurn({
      transcript: 'Перенеси будильник на 15.30',
      languageCode: 'ru-RU',
      referenceNow,
    });

    assert.match(result?.reply ?? '', /15:30/);
  });

  it('asks clarification when multiple alarms exist for delete', () => {
    createAlarmAt16();
    addSecondAlarmTomorrow6am();

    const result = resolveLocalAlarmTurn({
      transcript: 'Удали будильник',
      languageCode: 'ru-RU',
      referenceNow,
    });

    assert.match(result?.reply ?? '', /несколько будильников/i);
    assert.match(result?.reply ?? '', /удалить/i);
    assert.match(result?.reply ?? '', /Сегодня, 16:00/);
    assert.match(result?.reply ?? '', /Завтра, 06:00/);
    assert.equal(listScheduledLocalAlarms(referenceNow.getTime()).length, 2);
  });

  it('asks clarification when multiple alarms exist for reschedule', () => {
    createAlarmAt16();
    addSecondAlarmTomorrow6am();

    const result = resolveLocalAlarmTurn({
      transcript: 'Перенеси будильник на 15:30',
      languageCode: 'ru-RU',
      referenceNow,
    });

    assert.match(result?.reply ?? '', /несколько будильников/i);
    assert.match(result?.reply ?? '', /перенести/i);
    assert.equal(listScheduledLocalAlarms(referenceNow.getTime()).length, 2);
  });

  it('resolves pending delete clarification by schedule line', () => {
    createAlarmAt16();
    addSecondAlarmTomorrow6am();

    resolveLocalAlarmTurn({
      transcript: 'Удали будильник',
      languageCode: 'ru-RU',
      referenceNow,
    });

    const result = resolveLocalAlarmTurn({
      transcript: 'Сегодня, 16:00',
      languageCode: 'ru-RU',
      referenceNow,
    });

    assert.match(result?.reply ?? '', /16:00/);
    assert.match(result?.reply ?? '', /удалён/i);
    assert.equal(listScheduledLocalAlarms(referenceNow.getTime()).length, 1);
  });

  it('does not route alarm delete to calendar write detection', () => {
    assert.equal(isLocalAlarmCancelQuery('Удали будильник на 16 часов'), true);
    assert.equal(isLocalAlarmRescheduleQuery('Перенеси будильник на 15:30'), true);
    assert.equal(isOperationalCalendarWriteRequest('Удали будильник на 16 часов'), false);
    assert.equal(isOperationalCalendarWriteRequest('Перенеси будильник на 15:30'), false);
    assert.equal(isLocalAlarmIntent('Перенеси будильник на 15:30'), true);
  });
});

describe('alarm time parsing', () => {
  it('parses supported selector formats', () => {
    const cases = [
      { phrase: '16 часов', hour: 16, minute: 0 },
      { phrase: '16:00', hour: 16, minute: 0 },
      { phrase: '4 вечера', hour: 16, minute: 0 },
      { phrase: 'четыре вечера', hour: 16, minute: 0 },
      { phrase: '15.30', hour: 15, minute: 30 },
      { phrase: '15:30', hour: 15, minute: 30 },
      { phrase: 'завтра в 6 утра', hour: 6, minute: 0, dayOffset: 1 },
    ];

    for (const testCase of cases) {
      const parsed = parseAlarmSelectorTime(testCase.phrase, referenceNow);
      assert.ok(parsed, testCase.phrase);
      assert.equal(parsed!.getHours(), testCase.hour, `${testCase.phrase} hour`);
      assert.equal(parsed!.getMinutes(), testCase.minute, `${testCase.phrase} minute`);

      if (testCase.dayOffset === 1) {
        assert.equal(parsed!.getDate(), referenceNow.getDate() + 1, `${testCase.phrase} day`);
      }
    }
  });

  it('parses cancel and reschedule intents with time selectors', () => {
    const cancel = parseLocalAlarmIntent('Удали будильник на 16 часов', referenceNow);
    assert.equal(cancel?.kind, 'cancel');

    if (cancel?.kind === 'cancel') {
      assert.equal(cancel.timeSelector, '16 часов');
    }

    const reschedule = parseLocalAlarmIntent('Перенеси будильник на 15:30', referenceNow);
    assert.equal(reschedule?.kind, 'reschedule');

    if (reschedule?.kind === 'reschedule' && reschedule.targetTime) {
      assert.equal(reschedule.targetTime.getHours(), 15);
      assert.equal(reschedule.targetTime.getMinutes(), 30);
    }
  });

  it('matches alarms by parsed selector time', () => {
    createAlarmAt16();
    const alarms = listScheduledLocalAlarms(referenceNow.getTime());
    const matches = matchAlarmsByTimeSelector(alarms, '16 часов', referenceNow);

    assert.equal(matches.length, 1);
  });
});
