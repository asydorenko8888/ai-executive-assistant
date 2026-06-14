import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import {
  classifyLocalAlarmIntentKind,
  isLocalAlarmCreateQuery,
  isLocalAlarmIntent,
} from '@/src/features/local-alarms/localAlarmClassification';
import { parseLocalAlarmIntent } from '@/src/features/local-alarms/localAlarmIntentParser';
import {
  resetPendingLocalAlarmActionForTests,
} from '@/src/features/local-alarms/localAlarmPendingAction';
import {
  listScheduledLocalAlarms,
  resetLocalAlarmsForTests,
} from '@/src/features/local-alarms/localAlarmRuntimeStore';
import { resolveLocalAlarmTurn } from '@/src/features/local-alarms/resolveLocalAlarmTurn';

const referenceNow = new Date('2026-05-28T14:00:00+03:00');
const languageCode = 'ru-RU' as const;

function turn(transcript: string) {
  return resolveLocalAlarmTurn({
    transcript,
    languageCode,
    referenceNow,
  });
}

describe('alarm intent routing', () => {
  afterEach(() => {
    resetLocalAlarmsForTests();
    resetPendingLocalAlarmActionForTests();
  });

  it('classifies status questions before create', () => {
    const statusCases = [
      'На который час у меня будильник?',
      'На который час у меня стоит будильник?',
      'На сколько стоит будильник?',
      'Есть ли у меня будильник?',
      'Когда меня разбудишь?',
    ];

    for (const transcript of statusCases) {
      assert.equal(classifyLocalAlarmIntentKind(transcript), 'status', transcript);
      assert.equal(isLocalAlarmCreateQuery(transcript), false, transcript);
      assert.equal(parseLocalAlarmIntent(transcript, referenceNow)?.kind, 'status', transcript);
    }

    assert.equal(classifyLocalAlarmIntentKind('Какие будильники стоят?'), 'list');
    assert.equal(parseLocalAlarmIntent('Какие будильники стоят?', referenceNow)?.kind, 'list');
  });

  it('classifies move and delete without create fallback', () => {
    assert.equal(classifyLocalAlarmIntentKind('Перенеси будильник на полтора часа раньше.'), 'move');
    assert.equal(classifyLocalAlarmIntentKind('Перенеси будильник на час позже'), 'move');
    assert.equal(classifyLocalAlarmIntentKind('Сдвинь будильник на 30 минут'), 'move');
    assert.equal(classifyLocalAlarmIntentKind('Удали будильник'), 'delete');
    assert.equal(classifyLocalAlarmIntentKind('Убери будильник'), 'delete');

    assert.equal(isLocalAlarmCreateQuery('Перенеси будильник на полтора часа раньше.'), false);
    assert.equal(isLocalAlarmCreateQuery('Удали будильник'), false);
  });

  it('still classifies explicit create phrases', () => {
    const cases = [
      'Поставь будильник на 7 утра',
      'Разбуди меня в 6',
      'Будильник на завтра 8 утра',
    ];

    for (const transcript of cases) {
      assert.equal(classifyLocalAlarmIntentKind(transcript), 'create', transcript);
      assert.equal(isLocalAlarmIntent(transcript), true, transcript);
    }
  });

  it('answers status questions for a single alarm', () => {
    turn('Поставь будильник на 18:00');

    assert.equal(turn('На который час у меня будильник?')?.reply, 'Будильник стоит на 18:00.');
    assert.equal(turn('На сколько стоит будильник?')?.reply, 'Будильник стоит на 18:00.');
    assert.equal(turn('Есть ли будильник?')?.reply, 'Да. Будильник на 18:00.');
  });

  it('moves alarm one and a half hours earlier', () => {
    turn('Поставь будильник на 18:00');

    const result = turn('Перенеси будильник на полтора часа раньше.');
    assert.match(result?.reply ?? '', /16:30/);
    assert.equal(
      new Date(listScheduledLocalAlarms(referenceNow.getTime())[0]!.triggerAtMs).getHours(),
      16,
    );
    assert.equal(
      new Date(listScheduledLocalAlarms(referenceNow.getTime())[0]!.triggerAtMs).getMinutes(),
      30,
    );
  });

  it('never returns create parse failure text for status questions', () => {
    turn('Поставь будильник на 18:00');

    const result = turn('На который час у меня будильник?');
    assert.notEqual(result?.reply, 'Не понял, когда поставить будильник.');
  });
});
