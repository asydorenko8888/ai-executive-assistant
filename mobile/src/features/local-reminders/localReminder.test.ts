import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { isOperationalCalendarWriteRequest } from '@/src/features/agent/intent/operationalCalendarWriteDetection';
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

describe('local reminder classification', () => {
  it('detects create, list, and cancel phrases', () => {
    assert.equal(isLocalReminderIntent(TEST_TRANSCRIPT), true);
    assert.equal(isLocalReminderIntent('Поставь будильник на 7 утра'), true);
    assert.equal(isLocalReminderIntent('Разбуди меня через 10 минут'), true);
    assert.equal(isLocalReminderListQuery('Какие у меня напоминания?'), true);
    assert.equal(isLocalReminderIntent('Отмени напоминание'), true);
    assert.equal(isLocalReminderIntent('Удали будильник'), true);
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

  it('parses minute+second relative duration', () => {
    const parsed = parseRelativeDurationPhrase('6 минут 30 секунд');

    assert.equal(parsed?.totalMs, 6 * 60_000 + 30 * 1000);
  });

  it('parses absolute alarm time', () => {
    const intent = parseLocalReminderIntent('Поставь будильник на 7 утра', referenceNow);

    assert.equal(intent?.kind, 'create');

    if (intent?.kind !== 'create') {
      return;
    }

    assert.equal(intent.reminderKind, 'alarm');
    assert.equal(intent.triggerAt.getHours(), 7);
    assert.equal(intent.triggerAt.getMinutes(), 0);
  });

  it('parses list and cancel intents', () => {
    assert.equal(parseLocalReminderIntent('Какие у меня напоминания?')?.kind, 'list');
    assert.equal(parseLocalReminderIntent('Отмени напоминание')?.kind, 'cancel');
  });
});

describe('local reminder confirmation reply', () => {
  afterEach(() => {
    resetLocalRemindersForTests();
  });

  it('uses parsed delay for 2-minute reminder confirmation', () => {
    assert.equal(formatRequestedDelayLabel(2 * 60_000, 'ru-RU'), 'через 2 минуты');

    const logs = captureConsoleError();
    const referenceNow = new Date('2026-05-28T10:00:00+03:00');

    try {
      const result = resolveLocalReminderTurn({
        transcript: TEST_TRANSCRIPT,
        languageCode: 'ru-RU',
        referenceNow,
      });

      assert.equal(result?.reply, 'Хорошо. Напомню через 2 минуты: выпить воду.');

      const confirmationLog = logs.entries.find((entry) => entry[0] === 'LOCAL_REMINDER_CONFIRMATION_BUILT');

      assert.ok(confirmationLog);
      assert.equal((confirmationLog?.[1] as { requestedDelayMs?: number }).requestedDelayMs, 2 * 60_000);
      assert.equal((confirmationLog?.[1] as { replyText?: string }).replyText, result?.reply);
    } finally {
      logs.restore();
    }
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
    const logs = captureConsoleError();
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
    const logs = captureConsoleError();
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
    const logs = captureConsoleError();
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
