import { readSchedulingJson, writeSchedulingJson } from '@/src/features/local-scheduling/localSchedulingStorage';
import type {
  LocalScheduledPersistedStatus,
  PersistedLocalAlarmRecord,
  ScheduleAlarmPayload,
} from '@/src/features/local-scheduling/types';

const STORAGE_KEY = 'executive-ai.local-alarms.v1';

function toRecord(payload: ScheduleAlarmPayload): PersistedLocalAlarmRecord {
  return {
    id: payload.id,
    type: 'alarm',
    title: payload.title,
    scheduledAt: payload.scheduledAt,
    createdAt: payload.createdAt,
    status: payload.status ?? 'scheduled',
    notificationId: payload.id,
    sourceTranscript: payload.sourceTranscript,
    snoozeCount: payload.snoozeCount ?? 0,
    originalScheduledAt: payload.originalScheduledAt ?? payload.scheduledAt,
  };
}

export async function loadPersistedLocalAlarms(): Promise<PersistedLocalAlarmRecord[]> {
  return readSchedulingJson<PersistedLocalAlarmRecord[]>(STORAGE_KEY, []);
}

export async function savePersistedLocalAlarms(records: PersistedLocalAlarmRecord[]) {
  await writeSchedulingJson(STORAGE_KEY, records);
}

export async function upsertPersistedLocalAlarm(payload: ScheduleAlarmPayload) {
  const records = await loadPersistedLocalAlarms();
  const nextRecord = toRecord(payload);
  const index = records.findIndex((record) => record.id === payload.id);
  const next =
    index >= 0
      ? records.map((record, recordIndex) => (recordIndex === index ? nextRecord : record))
      : [nextRecord, ...records];

  await savePersistedLocalAlarms(next);
  return nextRecord;
}

export async function updatePersistedLocalAlarmStatus(
  id: string,
  status: LocalScheduledPersistedStatus,
  patch?: Partial<Pick<PersistedLocalAlarmRecord, 'scheduledAt' | 'snoozeCount' | 'notificationId'>>,
) {
  const records = await loadPersistedLocalAlarms();
  const index = records.findIndex((record) => record.id === id);

  if (index < 0) {
    return null;
  }

  const next = [...records];
  next[index] = {
    ...next[index]!,
    status,
    scheduledAt: patch?.scheduledAt ?? next[index]!.scheduledAt,
    snoozeCount: patch?.snoozeCount ?? next[index]!.snoozeCount,
    notificationId: patch?.notificationId ?? next[index]!.notificationId,
  };

  await savePersistedLocalAlarms(next);
  return next[index]!;
}

export async function removePersistedLocalAlarm(id: string) {
  const records = await loadPersistedLocalAlarms();
  const next = records.filter((record) => record.id !== id);
  await savePersistedLocalAlarms(next);
  return records.length !== next.length;
}

export async function resetPersistedLocalAlarmsForTests() {
  await savePersistedLocalAlarms([]);
}
