import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import {
  classifyLocalAlarmIntentKind,
  classifyLocalAlarmQueryVariant,
} from '@/src/features/local-alarms/localAlarmClassification';
import {
  resetPendingLocalAlarmActionForTests,
} from '@/src/features/local-alarms/localAlarmPendingAction';
import { isLocalAlarmQueryTranscript } from '@/src/features/local-alarms/localAlarmQueryDetection';
import {
  resetLocalAlarmsForTests,
} from '@/src/features/local-alarms/localAlarmRuntimeStore';
import { resolveLocalAlarmTurn } from '@/src/features/local-alarms/resolveLocalAlarmTurn';

const referenceNow = new Date('2026-05-28T14:00:00+03:00');

function turn(transcript: string, languageCode: 'ru-RU' | 'uk-UA' | 'en-US' = 'ru-RU') {
  return resolveLocalAlarmTurn({
    transcript,
    languageCode,
    referenceNow,
  });
}

describe('ALARM_QUERY natural language', () => {
  afterEach(() => {
    resetLocalAlarmsForTests();
    resetPendingLocalAlarmActionForTests();
  });

  const englishQueries = [
    ['What alarms do I have?', 'list'],
    ['When is my alarm?', 'time'],
    ['What time is my alarm set for?', 'time'],
    ['When do I need to wake up?', 'wake'],
    ['Do I have any alarms?', 'existence'],
    ['What is my next alarm?', 'next'],
    ['Show active alarms.', 'list'],
  ] as const;

  for (const [phrase, variant] of englishQueries) {
    it(`detects EN query: ${phrase}`, () => {
      assert.equal(isLocalAlarmQueryTranscript(phrase), true, phrase);
      assert.equal(classifyLocalAlarmQueryVariant(phrase), variant, phrase);
      assert.equal(classifyLocalAlarmIntentKind(phrase), variant === 'list' ? 'list' : 'status', phrase);
    });
  }

  const russianQueries = [
    ['На который час стоит будильник?', 'time'],
    ['Насколько у меня стоит будильник?', 'time'],
    ['Когда следующий будильник?', 'next'],
    ['Какие будильники активны?', 'list'],
    ['Когда мне вставать?', 'wake'],
    ['Есть ли у меня будильник?', 'existence'],
  ] as const;

  for (const [phrase, variant] of russianQueries) {
    it(`detects RU query: ${phrase}`, () => {
      assert.equal(isLocalAlarmQueryTranscript(phrase), true, phrase);
      assert.equal(classifyLocalAlarmQueryVariant(phrase), variant, phrase);
    });
  }

  const ukrainianQueries = [
    ['На котру годину стоїть будильник?', 'time'],
    ['Коли наступний будильник?', 'next'],
    ['Які будильники активні?', 'list'],
    ['Коли мене розбудити?', 'wake'],
  ] as const;

  for (const [phrase, variant] of ukrainianQueries) {
    it(`detects UK query: ${phrase}`, () => {
      assert.equal(isLocalAlarmQueryTranscript(phrase), true, phrase);
      assert.equal(classifyLocalAlarmQueryVariant(phrase), variant, phrase);
    });
  }

  it('returns human-friendly empty query reply', () => {
    const result = turn('Do I have any alarms?', 'en-US');
    assert.equal(result?.reply, 'No. No active alarms right now.');
  });

  it('returns human-friendly multi-alarm query reply', () => {
    turn('Set alarm for 18:00', 'en-US');
    turn('Set alarm for 22:00', 'en-US');
    turn('Yes', 'en-US');

    const result = turn('What alarms do I have?', 'en-US');
    assert.match(result?.reply ?? '', /You currently have 2 alarms/i);
    assert.match(result?.reply ?? '', /Today, 18:00/);
    assert.match(result?.reply ?? '', /Today, 22:00/);
  });

  it('continues multi-step move selection by time reply', () => {
    turn('Поставь будильник на 19:30');
    turn('Поставь будильник на 22:00');
    turn('Да');

    const clarification = turn('Перенеси будильник на 90 минут раньше');
    assert.match(clarification?.reply ?? '', /несколько будильников/i);

    const moved = turn('19:30');
    assert.match(moved?.reply ?? '', /Готово\. Будильник сработает/i);
    assert.match(moved?.reply ?? '', /18:00/);
  });

  it('continues multi-step move selection in English', () => {
    turn('Set alarm for 7:30 PM', 'en-US');
    turn('Set alarm for 10:00 PM', 'en-US');
    turn('Yes', 'en-US');

    turn('Move the alarm 90 minutes earlier', 'en-US');
    const moved = turn('7:30 PM', 'en-US');
    assert.match(moved?.reply ?? '', /Done\. Your alarm will ring/i);
    assert.match(moved?.reply ?? '', /6:00 PM|18:00/);
  });
});
