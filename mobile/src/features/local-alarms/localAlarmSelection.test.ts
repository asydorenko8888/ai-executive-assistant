import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import {
  buildOrderedAlarmSelectionOptions,
  getPendingAlarmSelection,
  resetPendingLocalAlarmActionForTests,
  setPendingAlarmSelection,
} from '@/src/features/local-alarms/localAlarmPendingAction';
import {
  createLocalAlarm,
  getLocalAlarmById,
  listScheduledLocalAlarms,
  resetLocalAlarmsForTests,
} from '@/src/features/local-alarms/localAlarmRuntimeStore';
import { resolveAlarmSelectionFromReply } from '@/src/features/local-alarms/localAlarmSelectionResolution';
import { resolveLocalAlarmTurn } from '@/src/features/local-alarms/resolveLocalAlarmTurn';

const referenceNow = new Date('2026-05-28T14:00:00+03:00');

function seedTwoAlarms() {
  resetLocalAlarmsForTests();
  createLocalAlarm({
    title: 'Alarm A',
    triggerAt: new Date('2026-05-28T19:30:00+03:00'),
    sourceTranscript: 'seed',
  });
  createLocalAlarm({
    title: 'Alarm B',
    triggerAt: new Date('2026-05-28T22:00:00+03:00'),
    sourceTranscript: 'seed',
  });
}

function orderedOptionsFromRuntime() {
  return buildOrderedAlarmSelectionOptions(
    listScheduledLocalAlarms(referenceNow.getTime()).map((alarm) => ({
      id: alarm.id,
      triggerAtMs: alarm.triggerAtMs,
      title: alarm.title,
    })),
    'ru-RU',
  );
}

function runtimeCandidates() {
  const options = orderedOptionsFromRuntime();

  return options
    .map((option) => getLocalAlarmById(option.id))
    .filter((alarm): alarm is NonNullable<typeof alarm> => Boolean(alarm));
}

describe('pending alarm selection resolution', () => {
  afterEach(() => {
    resetLocalAlarmsForTests();
    resetPendingLocalAlarmActionForTests();
  });

  it('stores ordered pending options when clarification is requested', () => {
    seedTwoAlarms();

    setPendingAlarmSelection({
      action: 'reschedule',
      orderedOptions: orderedOptionsFromRuntime(),
      relativeDeltaMs: -90 * 60 * 1000,
      createdAtMs: Date.now(),
    });

    const pending = getPendingAlarmSelection();
    assert.equal(pending?.orderedOptions.length, 2);
    assert.equal(pending?.orderedOptions[0]?.order, 1);
    assert.equal(pending?.orderedOptions[1]?.order, 2);
    assert.ok(pending!.orderedOptions[0]!.triggerAtMs < pending!.orderedOptions[1]!.triggerAtMs);
  });

  it('resolves ordinals against ordered options', () => {
    seedTwoAlarms();
    const options = orderedOptionsFromRuntime();
    const candidates = runtimeCandidates();

    const cases = [
      ['первый', 0],
      ['перший', 0],
      ['first', 0],
      ['1', 0],
      ['второй', 1],
      ['другой', 1],
      ['second', 1],
      ['2', 1],
      ['последний', 1],
      ['останній', 1],
      ['last', 1],
    ] as const;

    for (const [reply, expectedIndex] of cases) {
      const selected = resolveAlarmSelectionFromReply({
        reply,
        candidates,
        orderedOptions: options,
        referenceNow,
        languageCode: 'ru-RU',
      });

      assert.equal(selected?.id, candidates[expectedIndex]?.id, reply);
    }
  });

  it('resolves verb phrases and today time replies', () => {
    seedTwoAlarms();
    const options = orderedOptionsFromRuntime();
    const candidates = runtimeCandidates();

    assert.equal(
      resolveAlarmSelectionFromReply({
        reply: 'удали второй',
        candidates,
        orderedOptions: options,
        referenceNow,
        languageCode: 'ru-RU',
      })?.id,
      candidates[1]?.id,
    );

    assert.equal(
      resolveAlarmSelectionFromReply({
        reply: 'перенеси первый',
        candidates,
        orderedOptions: options,
        referenceNow,
        languageCode: 'ru-RU',
      })?.id,
      candidates[0]?.id,
    );

    assert.equal(
      resolveAlarmSelectionFromReply({
        reply: `сегодня ${options[0]!.displayTime}`,
        candidates,
        orderedOptions: options,
        referenceNow,
        languageCode: 'ru-RU',
      })?.id,
      candidates[0]?.id,
    );

    assert.equal(
      resolveAlarmSelectionFromReply({
        reply: options[1]!.displayTime,
        candidates,
        orderedOptions: options,
        referenceNow,
        languageCode: 'ru-RU',
      })?.id,
      candidates[1]?.id,
    );
  });

  it('continues pending reschedule selection through resolveLocalAlarmTurn', () => {
    seedTwoAlarms();

    setPendingAlarmSelection({
      action: 'reschedule',
      orderedOptions: orderedOptionsFromRuntime(),
      relativeDeltaMs: -90 * 60 * 1000,
      createdAtMs: Date.now(),
    });

    const moved = resolveLocalAlarmTurn({
      transcript: 'первый',
      languageCode: 'ru-RU',
      referenceNow,
    });
    const options = orderedOptionsFromRuntime();

    assert.match(moved?.reply ?? '', /сработает/i);
    assert.equal(
      listScheduledLocalAlarms(referenceNow.getTime()).find((alarm) => alarm.id === options[0]!.id)
        ?.triggerAtMs,
      new Date('2026-05-28T18:00:00+03:00').getTime(),
    );
  });

  it('continues pending delete selection through resolveLocalAlarmTurn', () => {
    seedTwoAlarms();
    const options = orderedOptionsFromRuntime();

    setPendingAlarmSelection({
      action: 'cancel',
      orderedOptions: options,
      createdAtMs: Date.now(),
    });

    const deleted = resolveLocalAlarmTurn({
      transcript: 'удали второй',
      languageCode: 'ru-RU',
      referenceNow,
    });

    assert.match(deleted?.reply ?? '', /удалён/i);
    assert.equal(listScheduledLocalAlarms(referenceNow.getTime()).length, 1);
    assert.equal(listScheduledLocalAlarms(referenceNow.getTime())[0]?.id, options[0]?.id);
  });
});
