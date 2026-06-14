import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import {
  findMissingScheduledIds,
  findOrphanScheduledIds,
  partitionPersistedItemsForHydrate,
  persistedAlarmToRuntime,
  persistedReminderToRuntime,
} from '@/src/features/local-scheduling/hydratePersistedItems';
import {
  loadPersistedLocalAlarms,
  resetPersistedLocalAlarmsForTests,
  updatePersistedLocalAlarmStatus,
  upsertPersistedLocalAlarm,
} from '@/src/features/local-scheduling/localAlarmStore';
import {
  loadPersistedLocalReminders,
  resetPersistedLocalRemindersForTests,
  upsertPersistedLocalReminder,
} from '@/src/features/local-scheduling/localReminderStore';
import {
  resetInMemoryLocalSchedulingStorageForTests,
  useInMemoryLocalSchedulingStorageForTests,
} from '@/src/features/local-scheduling/localSchedulingStorage';
import {
  hydrateRuntimeAlarmsFromPersisted,
  listScheduledLocalAlarms,
  resetLocalAlarmsForTests,
} from '@/src/features/local-alarms/localAlarmRuntimeStore';
import {
  hydrateRuntimeRemindersFromPersisted,
  listScheduledLocalReminders,
  resetLocalRemindersForTests,
} from '@/src/features/local-reminders/localReminderRuntimeStore';

const referenceNow = new Date('2026-05-28T10:00:00+03:00');

function resetState() {
  useInMemoryLocalSchedulingStorageForTests();
  resetInMemoryLocalSchedulingStorageForTests();
  resetPersistedLocalAlarmsForTests();
  resetPersistedLocalRemindersForTests();
  resetLocalAlarmsForTests();
  resetLocalRemindersForTests();
}

describe('local scheduling persistence', () => {
  afterEach(() => {
    resetState();
  });

  it('saves and loads alarm records', async () => {
    resetState();

    await upsertPersistedLocalAlarm({
      id: 'alarm-1',
      title: 'Wake up',
      scheduledAt: '2026-05-28T11:00:00.000Z',
      createdAt: '2026-05-28T10:00:00.000Z',
      sourceTranscript: 'Поставь будильник на 11',
      snoozeCount: 0,
      originalScheduledAt: '2026-05-28T11:00:00.000Z',
    });

    const records = await loadPersistedLocalAlarms();

    assert.equal(records.length, 1);
    assert.equal(records[0]?.type, 'alarm');
    assert.equal(records[0]?.title, 'Wake up');
    assert.equal(records[0]?.status, 'scheduled');
    assert.equal(records[0]?.notificationId, 'alarm-1');
  });

  it('saves and loads reminder records', async () => {
    resetState();

    await upsertPersistedLocalReminder({
      id: 'reminder-1',
      text: 'перевірити тест',
      scheduledAt: '2026-05-28T10:02:00.000Z',
      createdAt: '2026-05-28T10:00:00.000Z',
      sourceTranscript: 'Нагадай через 2 хвилини перевірити тест',
      reminderKind: 'reminder',
    });

    const records = await loadPersistedLocalReminders();

    assert.equal(records.length, 1);
    assert.equal(records[0]?.type, 'reminder');
    assert.equal(records[0]?.text, 'перевірити тест');
    assert.equal(records[0]?.notificationId, 'reminder-1');
  });

  it('marks alarm cancelled', async () => {
    resetState();

    await upsertPersistedLocalAlarm({
      id: 'alarm-1',
      title: 'Wake up',
      scheduledAt: '2026-05-28T11:00:00.000Z',
      createdAt: '2026-05-28T10:00:00.000Z',
      sourceTranscript: 'test',
    });

    await updatePersistedLocalAlarmStatus('alarm-1', 'cancelled');
    const records = await loadPersistedLocalAlarms();

    assert.equal(records[0]?.status, 'cancelled');
  });
});

describe('local scheduling hydrate helpers', () => {
  it('keeps only future scheduled items', () => {
    const referenceNowMs = referenceNow.getTime();
    const partition = partitionPersistedItemsForHydrate(
      [
        {
          id: 'future',
          type: 'reminder',
          text: 'ok',
          scheduledAt: new Date(referenceNowMs + 60_000).toISOString(),
          createdAt: referenceNow.toISOString(),
          status: 'scheduled',
          notificationId: 'future',
          sourceTranscript: 'x',
          reminderKind: 'reminder',
        },
        {
          id: 'expired',
          type: 'reminder',
          text: 'old',
          scheduledAt: new Date(referenceNowMs - 60_000).toISOString(),
          createdAt: referenceNow.toISOString(),
          status: 'scheduled',
          notificationId: 'expired',
          sourceTranscript: 'x',
          reminderKind: 'reminder',
        },
        {
          id: 'cancelled',
          type: 'reminder',
          text: 'no',
          scheduledAt: new Date(referenceNowMs + 120_000).toISOString(),
          createdAt: referenceNow.toISOString(),
          status: 'cancelled',
          notificationId: 'cancelled',
          sourceTranscript: 'x',
          reminderKind: 'reminder',
        },
      ],
      referenceNowMs,
    );

    assert.equal(partition.active.length, 2);
    assert.equal(partition.active[0]?.id, 'future');
    assert.equal(partition.active[1]?.id, 'expired');
    assert.equal(partition.expired, 1);
  });

  it('hydrates runtime reminder store from persisted records', () => {
    resetState();

    const runtime = persistedReminderToRuntime({
      id: 'reminder-1',
      type: 'reminder',
      text: 'перевірити тест',
      scheduledAt: new Date(referenceNow.getTime() + 120_000).toISOString(),
      createdAt: referenceNow.toISOString(),
      status: 'scheduled',
      notificationId: 'reminder-1',
      sourceTranscript: 'test',
      reminderKind: 'reminder',
    });

    hydrateRuntimeRemindersFromPersisted([runtime]);

    assert.equal(listScheduledLocalReminders(referenceNow.getTime()).length, 1);
    assert.equal(listScheduledLocalReminders(referenceNow.getTime())[0]?.text, 'перевірити тест');
  });

  it('hydrates runtime alarm store from persisted records', () => {
    resetState();

    const runtime = persistedAlarmToRuntime({
      id: 'alarm-1',
      type: 'alarm',
      title: 'Будильник',
      scheduledAt: new Date(referenceNow.getTime() + 120_000).toISOString(),
      createdAt: referenceNow.toISOString(),
      status: 'scheduled',
      notificationId: 'alarm-1',
      sourceTranscript: 'test',
      snoozeCount: 0,
      originalScheduledAt: new Date(referenceNow.getTime() + 120_000).toISOString(),
    });

    hydrateRuntimeAlarmsFromPersisted([runtime]);

    assert.equal(listScheduledLocalAlarms(referenceNow.getTime()).length, 1);
  });

  it('finds missing and orphan scheduled notification ids', () => {
    assert.deepEqual(findMissingScheduledIds(['a', 'b'], ['a']), ['b']);
    assert.deepEqual(findOrphanScheduledIds(['a'], ['a', 'orphan']), ['orphan']);
  });
});
