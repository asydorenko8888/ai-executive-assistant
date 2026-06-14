import { readSchedulingJson, writeSchedulingJson } from '@/src/features/local-scheduling/localSchedulingStorage';
import type {
  LocalScheduledPersistedStatus,
  PersistedLocalReminderRecord,
  ScheduleReminderPayload,
} from '@/src/features/local-scheduling/types';

const STORAGE_KEY = 'executive-ai.local-reminders.v1';

function toRecord(payload: ScheduleReminderPayload): PersistedLocalReminderRecord {
  return {
    id: payload.id,
    type: 'reminder',
    text: payload.text,
    scheduledAt: payload.scheduledAt,
    createdAt: payload.createdAt,
    status: payload.status ?? 'scheduled',
    notificationId: payload.id,
    sourceTranscript: payload.sourceTranscript,
    reminderKind: payload.reminderKind ?? 'reminder',
  };
}

export async function loadPersistedLocalReminders(): Promise<PersistedLocalReminderRecord[]> {
  return readSchedulingJson<PersistedLocalReminderRecord[]>(STORAGE_KEY, []);
}

export async function savePersistedLocalReminders(records: PersistedLocalReminderRecord[]) {
  await writeSchedulingJson(STORAGE_KEY, records);
}

export async function upsertPersistedLocalReminder(payload: ScheduleReminderPayload) {
  const records = await loadPersistedLocalReminders();
  const nextRecord = toRecord(payload);
  const index = records.findIndex((record) => record.id === payload.id);
  const next =
    index >= 0
      ? records.map((record, recordIndex) => (recordIndex === index ? nextRecord : record))
      : [nextRecord, ...records];

  await savePersistedLocalReminders(next);
  return nextRecord;
}

export async function updatePersistedLocalReminderStatus(
  id: string,
  status: LocalScheduledPersistedStatus,
  patch?: Partial<Pick<PersistedLocalReminderRecord, 'scheduledAt' | 'notificationId'>>,
) {
  const records = await loadPersistedLocalReminders();
  const index = records.findIndex((record) => record.id === id);

  if (index < 0) {
    return null;
  }

  const next = [...records];
  next[index] = {
    ...next[index]!,
    status,
    scheduledAt: patch?.scheduledAt ?? next[index]!.scheduledAt,
    notificationId: patch?.notificationId ?? next[index]!.notificationId,
  };

  await savePersistedLocalReminders(next);
  return next[index]!;
}

export async function removePersistedLocalReminder(id: string) {
  const records = await loadPersistedLocalReminders();
  const next = records.filter((record) => record.id !== id);
  await savePersistedLocalReminders(next);
  return records.length !== next.length;
}

export async function resetPersistedLocalRemindersForTests() {
  await savePersistedLocalReminders([]);
}
