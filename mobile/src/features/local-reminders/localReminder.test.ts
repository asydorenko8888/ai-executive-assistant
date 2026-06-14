import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { isOperationalCalendarWriteRequest } from '@/src/features/agent/intent/operationalCalendarWriteDetection';
import { isLocalAlarmIntent } from '@/src/features/local-alarms/localAlarmClassification';
import {
  isLocalReminderIntent,
  isLocalReminderListQuery,
} from '@/src/features/local-reminders/localReminderClassification';
import { parseLocalReminderIntent } from '@/src/features/local-reminders/localReminderIntentParser';
import {
  listDueLocalReminders,
  listScheduledLocalReminders,
  resetLocalRemindersForTests,
} from '@/src/features/local-reminders/localReminderRuntimeStore';
import { parseRelativeDurationPhrase } from '@/src/features/local-reminders/localReminderTimeParser';
import { buildLocalReminderCreatedReply, buildLocalReminderTriggeredSpeech, formatRequestedDelayLabel } from '@/src/features/local-reminders/localReminderReplies';
import { resolveLocalReminderTurn } from '@/src/features/local-reminders/resolveLocalReminderTurn';

const TEST_TRANSCRIPT = 'Напомни мне через 2 минуты выпить воду';

function captureDevLog() {
  const entries: unknown[][] = [];
  const original = console.log;

  console.log = (...args: unknown[]) => {
    entries.push(args);
  };

  return {
    entries,
    restore() {
      console.log = original;
    },
  };
}

describe('local reminder classification', () => {
  it('detects create, list, and cancel phrases', () => {
    assert.equal(isLocalReminderIntent(TEST_TRANSCRIPT), true);
    assert.equal(isLocalAlarmIntent('Поставь будильник на 7 утра'), true);
    assert.equal(isLocalReminderIntent('Поставь будильник на 7 утра'), false);
    assert.equal(isLocalReminderListQuery('Какие у меня напоминания?'), true);
    assert.equal(isLocalReminderIntent('Отмени напоминание'), true);
    assert.equal(isLocalAlarmIntent('Удали будильник'), true);
    assert.equal(isLocalReminderIntent('Удали будильник'), false);
  });

  it('does not treat calendar reminders as local reminders', () => {
    assert.equal(isLocalReminderIntent('Напомни в календаре через час'), false);
  });

  it('excludes local reminders from calendar write detection', () => {
    assert.equal(isOperationalCalendarWriteRequest(TEST_TRANSCRIPT), false);
    assert.equal(isOperationalCalendarWriteRequest('Поставь будильник на 7 утра'), false);
    assert.equal(isOperationalCalendarWriteRequest('Отмени напоминание'), false);
  });
});

describe('local reminder intent parser', () => {
  const referenceNow = new Date('2026-05-28T10:00:00+03:00');

  it('parses relative reminder with title', () => {
    const intent = parseLocalReminderIntent(TEST_TRANSCRIPT, referenceNow);

    assert.equal(intent?.kind, 'create');

    if (intent?.kind !== 'create') {
      return;
    }

    assert.equal(intent.text, 'выпить воду');
    assert.equal(intent.reminderKind, 'reminder');
    assert.equal(intent.requestedDelayMs, 2 * 60_000);
    assert.equal(intent.triggerAt.getTime(), referenceNow.getTime() + 2 * 60_000);
  });

  it('parses common Russian reminder phrasings', () => {
    const phrases = [
      {
        transcript: 'напомни мне через 2 минуты выпить кофе',
        text: 'выпить кофе',
      },
      {
        transcript: 'напомни через 2 минуты выпить кофе',
        text: 'выпить кофе',
      },
      {
        transcript: 'напомни через 2 минуты выпить воду',
        text: 'выпить воду',
      },
      {
        transcript: 'напомни, через 2 минуты выпить воду',
        text: 'выпить воду',
      },
      {
        transcript: 'напомни мне выпить кофе через 2 минуты',
        text: 'выпить кофе',
      },
      {
        transcript: 'напомни, мне через 2 минуты выпить кофе',
        text: 'выпить кофе',
      },
      {
        transcript: 'напомни мне, через 2 минуты выпить кофе',
        text: 'выпить кофе',
      },
      {
        transcript: 'напомни мне через 2 минуты, выпить кофе',
        text: 'выпить кофе',
      },
      {
        transcript: 'Напомни, выпить кофе через 2 минуты',
        text: 'выпить кофе',
      },
      {
        transcript: 'Напомни, выпить кофе через 2 минуты.',
        text: 'выпить кофе',
      },
      {
        transcript: 'Напомню, выпить кофе через 2 минуты',
        text: 'выпить кофе',
      },
    ];

    for (const phrase of phrases) {
      const intent = parseLocalReminderIntent(phrase.transcript, referenceNow);

      assert.equal(intent?.kind, 'create', phrase.transcript);

      if (intent?.kind !== 'create') {
        continue;
      }

      assert.equal(intent.text, phrase.text, phrase.transcript);
      assert.equal(intent.requestedDelayMs, 2 * 60_000, phrase.transcript);
    }
  });

  it('parses minute+second relative duration', () => {
    const parsed = parseRelativeDurationPhrase('6 минут 30 секунд');

    assert.equal(parsed?.totalMs, 6 * 60_000 + 30 * 1000);
  });

  it('parses list and cancel intents', () => {
    assert.equal(parseLocalReminderIntent('Какие у меня напоминания?')?.kind, 'list');
    assert.equal(parseLocalReminderIntent('Отмени напоминание')?.kind, 'cancel');
    assert.equal(parseLocalReminderIntent('Поставь будильник на 7 утра'), null);
  });
});

describe('local reminder confirmation reply', () => {
  afterEach(() => {
    resetLocalRemindersForTests();
  });

  it('uses parsed delay for 2-minute reminder confirmation', () => {
    assert.equal(formatRequestedDelayLabel(2 * 60_000, 'ru-RU'), 'через 2 минуты');

    const logs = captureDevLog();
    const referenceNow = new Date('2026-05-28T10:00:00+03:00');

    try {
      const result = resolveLocalReminderTurn({
        transcript: 'напомни мне через 2 минуты выпить кофе',
        languageCode: 'ru-RU',
        referenceNow,
      });

      assert.equal(result?.reply, 'Хорошо. Напомню через 2 минуты: выпить кофе.');

      const confirmationLog = logs.entries.find((entry) => entry[0] === 'LOCAL_REMINDER_CONFIRMATION_BUILT');

      assert.ok(confirmationLog);
      assert.equal((confirmationLog?.[1] as { requestedDelayMs?: number }).requestedDelayMs, 2 * 60_000);
      assert.equal((confirmationLog?.[1] as { replyText?: string }).replyText, result?.reply);
    } finally {
      logs.restore();
    }
  });

  it('acceptance: напомни через 2 минуты выпить воду', () => {
    const logs = captureDevLog();
    const referenceNow = new Date('2026-05-28T10:00:00+03:00');

    try {
      const result = resolveLocalReminderTurn({
        transcript: 'напомни через 2 минуты выпить воду',
        languageCode: 'ru-RU',
        referenceNow,
      });

      assert.equal(result?.reply, 'Хорошо. Напомню через 2 минуты: выпить воду.');
    } finally {
      logs.restore();
    }
  });

  it('acceptance: Напомни, выпить кофе через 2 минуты', () => {
    const logs = captureDevLog();
    const referenceNow = new Date('2026-05-28T10:00:00+03:00');

    try {
      const result = resolveLocalReminderTurn({
        transcript: 'Напомни, выпить кофе через 2 минуты',
        languageCode: 'ru-RU',
        referenceNow,
      });

      assert.equal(result?.reply, 'Хорошо. Напомню через 2 минуты: выпить кофе.');
    } finally {
      logs.restore();
    }
  });

  it('acceptance: STT future-tense Напомню routes to scheduler', () => {
    const referenceNow = new Date('2026-05-28T10:00:00+03:00');
    const result = resolveLocalReminderTurn({
      transcript: 'Напомню, выпить кофе через 2 минуты',
      languageCode: 'ru-RU',
      referenceNow,
    });

    assert.equal(result?.reply, 'Хорошо. Напомню через 2 минуты: выпить кофе.');
  });

  it('uses parsed delay for minute+second confirmation', () => {
    assert.equal(
      formatRequestedDelayLabel(6 * 60_000 + 30 * 1000, 'ru-RU'),
      'через 6 минут 30 секунд',
    );

    const reply = buildLocalReminderCreatedReply({
      reminder: {
        id: 'test',
        text: 'выпить воду',
        triggerAtMs: Date.now() + 6 * 60_000 + 30 * 1000,
        kind: 'reminder',
        status: 'scheduled',
        sourceTranscript: 'Напомни через 6 минут 30 секунд выпить воду',
        createdAtMs: Date.now(),
      },
      languageCode: 'ru-RU',
      requestedDelayMs: 6 * 60_000 + 30 * 1000,
    });

    assert.equal(reply, 'Хорошо. Напомню через 6 минут 30 секунд: выпить воду.');
  });
});

describe('local reminder runtime flow', () => {
  afterEach(() => {
    resetLocalRemindersForTests();
  });

  it('creates reminder and logs LOCAL_REMINDER_CREATED for the test phrase', () => {
    const logs = captureDevLog();
    const referenceNow = new Date('2026-05-28T10:00:00+03:00');

    try {
      const result = resolveLocalReminderTurn({
        transcript: TEST_TRANSCRIPT,
        languageCode: 'ru-RU',
        referenceNow,
      });

      assert.ok(result?.reply.includes('выпить воду'));
      assert.ok(result?.reply.includes('через 2 минуты'));
      assert.equal(listScheduledLocalReminders(referenceNow.getTime()).length, 1);

      const createdLog = logs.entries.find((entry) => entry[0] === 'LOCAL_REMINDER_CREATED');

      assert.ok(createdLog);
      assert.equal((createdLog?.[1] as { text?: string }).text, 'выпить воду');
    } finally {
      logs.restore();
    }
  });

  it('triggers due reminder and logs LOCAL_REMINDER_TRIGGERED', () => {
    const logs = captureDevLog();
    const referenceNow = new Date('2026-05-28T10:00:00+03:00');

    try {
      resolveLocalReminderTurn({
        transcript: TEST_TRANSCRIPT,
        languageCode: 'ru-RU',
        referenceNow,
      });

      const due = listDueLocalReminders(referenceNow.getTime() + 2 * 60_000);

      assert.equal(due.length, 1);
      assert.equal(buildLocalReminderTriggeredSpeech(due[0]!), 'Напоминание: выпить воду.');
    } finally {
      logs.restore();
    }
  });

  it('asks clarification when several reminders match cancel', () => {
    const referenceNow = new Date('2026-05-28T10:00:00+03:00');

    resolveLocalReminderTurn({
      transcript: 'Напомни мне через 5 минут выпить воду',
      languageCode: 'ru-RU',
      referenceNow,
    });
    resolveLocalReminderTurn({
      transcript: 'Напомни мне через 10 минут позвонить маме',
      languageCode: 'ru-RU',
      referenceNow,
    });

    const result = resolveLocalReminderTurn({
      transcript: 'Отмени напоминание',
      languageCode: 'ru-RU',
      referenceNow,
    });

    assert.ok(result?.reply.includes('несколько напоминаний'));
  });

  it('cancels a single reminder and logs LOCAL_REMINDER_CANCELLED', () => {
    const logs = captureDevLog();
    const referenceNow = new Date('2026-05-28T10:00:00+03:00');

    try {
      resolveLocalReminderTurn({
        transcript: TEST_TRANSCRIPT,
        languageCode: 'ru-RU',
        referenceNow,
      });

      const result = resolveLocalReminderTurn({
        transcript: 'Отмени напоминание',
        languageCode: 'ru-RU',
        referenceNow,
      });

      assert.ok(result?.reply.includes('Отменено'));
      assert.equal(listScheduledLocalReminders(referenceNow.getTime()).length, 0);

      const cancelledLog = logs.entries.find((entry) => entry[0] === 'LOCAL_REMINDER_CANCELLED');

      assert.ok(cancelledLog);
    } finally {
      logs.restore();
    }
  });
});
