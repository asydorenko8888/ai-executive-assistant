import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

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

function alarmHour() {
  const alarms = listScheduledLocalAlarms(referenceNow.getTime());
  assert.equal(alarms.length, 1);
  return new Date(alarms[0]!.triggerAtMs).getHours();
}

describe('alarm UX verification phrases', () => {
  afterEach(() => {
    resetLocalAlarmsForTests();
    resetPendingLocalAlarmActionForTests();
  });

  it('runs the full conflict, status, move, and delete flow', () => {
    turn('Поставь будильник на 17:00');

    const conflict = turn('Поставь будильник на 6 вечера.');
    assert.match(conflict?.reply ?? '', /уже есть активный будильник на 17:00/i);
    assert.match(conflict?.reply ?? '', /Оставить его и добавить новый на 18:00/i);

    const replaced = turn('Нет.');
    assert.match(replaced?.reply ?? '', /Готово\. Будильник сработает/i);
    assert.match(replaced?.reply ?? '', /18:00/);
    assert.equal(alarmHour(), 18);

    const statusAfterReplace = turn('На сколько стоит будильник?');
    assert.equal(statusAfterReplace?.reply, 'Будильник стоит на 18:00.');

    const moved = turn('Перенеси будильник на час позже.');
    assert.match(moved?.reply ?? '', /Готово\. Будильник сработает/i);
    assert.match(moved?.reply ?? '', /19:00/);
    assert.equal(alarmHour(), 19);

    const statusAfterMove = turn('На который час будильник?');
    assert.equal(statusAfterMove?.reply, 'Будильник стоит на 19:00.');

    const deleted = turn('Удали будильник.');
    assert.match(deleted?.reply ?? '', /19:00/);
    assert.match(deleted?.reply ?? '', /удалён/i);
    assert.equal(listScheduledLocalAlarms(referenceNow.getTime()).length, 0);

    const emptyList = turn('Какие будильники стоят?');
    assert.equal(emptyList?.reply, 'Сейчас активных будильников нет.');
  });

  it('asks which alarm to move when multiple exist', () => {
    turn('Поставь будильник на 17:00');
    turn('Поставь будильник на 18:00');
    turn('Да');

    const clarification = turn('Перенеси будильник на час позже.');
    assert.match(clarification?.reply ?? '', /несколько будильников/i);
    assert.match(clarification?.reply ?? '', /17:00/);
    assert.match(clarification?.reply ?? '', /18:00/);
    assert.match(clarification?.reply ?? '', /Какой перенести/i);

    const moved = turn('17:00');
    assert.match(moved?.reply ?? '', /Готово\. Будильник сработает/i);
    assert.match(moved?.reply ?? '', /18:00/);
    assert.equal(listScheduledLocalAlarms(referenceNow.getTime()).length, 2);
  });

  it('resolves move selection with "первый"', () => {
    turn('Поставь будильник на 17:00');
    turn('Поставь будильник на 18:00');
    turn('Да');

    turn('Перенеси будильник на час позже.');
    const moved = turn('первый');
    assert.match(moved?.reply ?? '', /Готово\. Будильник сработает/i);
    assert.match(moved?.reply ?? '', /18:00/);
  });
});
