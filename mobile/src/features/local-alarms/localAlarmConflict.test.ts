import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { parseAlarmConflictDecision } from '@/src/features/local-alarms/localAlarmConflictDecision';
import {
  getPendingLocalAlarmAction,
  resetPendingLocalAlarmActionForTests,
} from '@/src/features/local-alarms/localAlarmPendingAction';
import {
  listScheduledLocalAlarms,
  resetLocalAlarmsForTests,
} from '@/src/features/local-alarms/localAlarmRuntimeStore';
import { resolveLocalAlarmTurn } from '@/src/features/local-alarms/resolveLocalAlarmTurn';

const referenceNow = new Date('2026-05-28T14:00:00+03:00');

function createAlarmAt16() {
  return resolveLocalAlarmTurn({
    transcript: 'Разбуди меня в 16:00',
    languageCode: 'ru-RU',
    referenceNow,
  });
}

function confirmKeepBoth() {
  return resolveLocalAlarmTurn({
    transcript: 'Да',
    languageCode: 'ru-RU',
    referenceNow,
  });
}

describe('alarm conflict resolution', () => {
  afterEach(() => {
    resetLocalAlarmsForTests();
    resetPendingLocalAlarmActionForTests();
  });

  it('asks conflict decision when creating a second alarm', () => {
    createAlarmAt16();

    const conflict = resolveLocalAlarmTurn({
      transcript: 'Разбуди меня в 17:00',
      languageCode: 'ru-RU',
      referenceNow,
    });

    assert.match(conflict?.reply ?? '', /уже есть активный будильник на 16:00/i);
    assert.match(conflict?.reply ?? '', /Оставить его и добавить новый на 17:00/i);
    assert.equal(getPendingLocalAlarmAction()?.state, 'WAITING_ALARM_CONFLICT_DECISION');
    assert.equal(listScheduledLocalAlarms(referenceNow.getTime()).length, 1);
  });

  it('keeps both alarms when user answers yes', () => {
    createAlarmAt16();

    resolveLocalAlarmTurn({
      transcript: 'Wake me up at 17:00',
      languageCode: 'en-US',
      referenceNow,
    });

    const result = resolveLocalAlarmTurn({
      transcript: 'Yes',
      languageCode: 'en-US',
      referenceNow,
    });

    assert.match(result?.reply ?? '', /Done\. Active alarms:/i);
    assert.match(result?.reply ?? '', /16:00/);
    assert.match(result?.reply ?? '', /17:00/);
    assert.equal(getPendingLocalAlarmAction(), null);
  });

  it('replaces existing alarm when user answers no', () => {
    createAlarmAt16();

    resolveLocalAlarmTurn({
      transcript: 'Set alarm for 5 PM',
      languageCode: 'en-US',
      referenceNow,
    });

    const result = resolveLocalAlarmTurn({
      transcript: 'No',
      languageCode: 'en-US',
      referenceNow,
    });

    assert.match(result?.reply ?? '', /Done\. Your alarm will ring/i);
    assert.match(result?.reply ?? '', /17:00|5:00 PM/i);
    assert.equal(listScheduledLocalAlarms(referenceNow.getTime()).length, 1);
    assert.equal(
      new Date(listScheduledLocalAlarms(referenceNow.getTime())[0]!.triggerAtMs).getHours(),
      17,
    );
  });

  it('does not create duplicate alarm at identical time', () => {
    createAlarmAt16();

    const result = resolveLocalAlarmTurn({
      transcript: 'Alarm at 16:00',
      languageCode: 'en-US',
      referenceNow,
    });

    assert.match(result?.reply ?? '', /already exists/i);
    assert.equal(listScheduledLocalAlarms(referenceNow.getTime()).length, 1);
    assert.equal(getPendingLocalAlarmAction(), null);
  });

  it('moves single alarm one hour later', () => {
    createAlarmAt16();

    const result = resolveLocalAlarmTurn({
      transcript: 'Move alarm one hour later',
      languageCode: 'en-US',
      referenceNow,
    });

    assert.match(result?.reply ?? '', /Done\. Your alarm will ring/i);
    assert.match(result?.reply ?? '', /17:00|5:00 PM/i);
    assert.equal(listScheduledLocalAlarms(referenceNow.getTime()).length, 1);
    assert.equal(
      new Date(listScheduledLocalAlarms(referenceNow.getTime())[0]!.triggerAtMs).getHours(),
      17,
    );
  });

  it('asks which alarm to move when multiple exist', () => {
    createAlarmAt16();
    resolveLocalAlarmTurn({
      transcript: 'Разбуди меня в 18:00',
      languageCode: 'ru-RU',
      referenceNow,
    });
    confirmKeepBoth();

    const result = resolveLocalAlarmTurn({
      transcript: 'Move alarm one hour later',
      languageCode: 'en-US',
      referenceNow,
    });

    assert.match(result?.reply ?? '', /multiple alarms/i);
    assert.match(result?.reply ?? '', /16:00/);
    assert.match(result?.reply ?? '', /18:00/);
    assert.equal(getPendingLocalAlarmAction()?.state, 'WAITING_ALARM_SELECTION');
    assert.equal(listScheduledLocalAlarms(referenceNow.getTime()).length, 2);
  });

  it('resolves move selection with "the first one"', () => {
    createAlarmAt16();
    resolveLocalAlarmTurn({
      transcript: 'Разбуди меня в 18:00',
      languageCode: 'ru-RU',
      referenceNow,
    });
    confirmKeepBoth();

    resolveLocalAlarmTurn({
      transcript: 'Move alarm one hour later',
      languageCode: 'en-US',
      referenceNow,
    });

    const result = resolveLocalAlarmTurn({
      transcript: 'The first one',
      languageCode: 'en-US',
      referenceNow,
    });

    assert.match(result?.reply ?? '', /Done\. Your alarm will ring/i);
    assert.match(result?.reply ?? '', /17:00|5:00 PM/i);

    const alarms = listScheduledLocalAlarms(referenceNow.getTime());
    assert.equal(alarms.length, 2);
    assert.ok(
      alarms.some((alarm) => new Date(alarm.triggerAtMs).getHours() === 17),
      'expected a 17:00 alarm after moving the first one',
    );
    assert.ok(
      alarms.some((alarm) => new Date(alarm.triggerAtMs).getHours() === 18),
      'expected the 18:00 alarm to remain unchanged',
    );
  });

  it('parses conflict decisions', () => {
    assert.equal(parseAlarmConflictDecision('Yes'), 'keep_both');
    assert.equal(parseAlarmConflictDecision('Keep both'), 'keep_both');
    assert.equal(parseAlarmConflictDecision('Да'), 'keep_both');
    assert.equal(parseAlarmConflictDecision('No'), 'replace');
    assert.equal(parseAlarmConflictDecision('Замени'), 'replace');
  });
});
