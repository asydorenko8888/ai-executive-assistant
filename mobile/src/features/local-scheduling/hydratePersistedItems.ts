import type { LocalAlarm } from '@/src/features/local-alarms/types';
import type { LocalReminder } from '@/src/features/local-reminders/types';
import type {
  PersistedLocalAlarmRecord,
  PersistedLocalReminderRecord,
} from '@/src/features/local-scheduling/types';

export function persistedAlarmToRuntime(record: PersistedLocalAlarmRecord): LocalAlarm {
  return {
    id: record.id,
    title: record.title,
    triggerAtMs: Date.parse(record.scheduledAt),
    originalTriggerAtMs: Date.parse(record.originalScheduledAt),
    snoozeCount: record.snoozeCount,
    status: record.status === 'scheduled' || record.status === 'snoozed' ? 'scheduled' : record.status === 'cancelled' ? 'cancelled' : 'stopped',
    sourceTranscript: record.sourceTranscript,
    createdAtMs: Date.parse(record.createdAt),
  };
}

export function persistedReminderToRuntime(record: PersistedLocalReminderRecord): LocalReminder {
  return {
    id: record.id,
    text: record.text,
    triggerAtMs: Date.parse(record.scheduledAt),
    kind: record.reminderKind,
    status: record.status === 'scheduled' ? 'scheduled' : record.status === 'cancelled' ? 'cancelled' : 'triggered',
    sourceTranscript: record.sourceTranscript,
    createdAtMs: Date.parse(record.createdAt),
  };
}

export function runtimeAlarmToSchedulePayload(alarm: LocalAlarm): {
  id: string;
  title: string;
  scheduledAt: string;
  createdAt: string;
  sourceTranscript: string;
  snoozeCount: number;
  originalScheduledAt: string;
} {
  return {
    id: alarm.id,
    title: alarm.title,
    scheduledAt: new Date(alarm.triggerAtMs).toISOString(),
    createdAt: new Date(alarm.createdAtMs).toISOString(),
    sourceTranscript: alarm.sourceTranscript,
    snoozeCount: alarm.snoozeCount,
    originalScheduledAt: new Date(alarm.originalTriggerAtMs).toISOString(),
  };
}

export function runtimeReminderToSchedulePayload(reminder: LocalReminder): {
  id: string;
  text: string;
  scheduledAt: string;
  createdAt: string;
  sourceTranscript: string;
  reminderKind: LocalReminder['kind'];
} {
  return {
    id: reminder.id,
    text: reminder.text,
    scheduledAt: new Date(reminder.triggerAtMs).toISOString(),
    createdAt: new Date(reminder.createdAtMs).toISOString(),
    sourceTranscript: reminder.sourceTranscript,
    reminderKind: reminder.kind,
  };
}

export function partitionPersistedItemsForHydrate<T extends { status: string; scheduledAt: string }>(
  records: T[],
  referenceNowMs: number,
) {
  const active: T[] = [];
  let expired = 0;

  for (const record of records) {
    if (record.status === 'cancelled' || record.status === 'fired') {
      continue;
    }

    if (record.status === 'scheduled' || record.status === 'snoozed') {
      if (Date.parse(record.scheduledAt) <= referenceNowMs) {
        expired += 1;
      }

      active.push(record);
    }
  }

  return { active, expired };
}

export function findMissingScheduledIds(
  activeIds: string[],
  scheduledNotificationIds: string[],
) {
  const scheduledSet = new Set(scheduledNotificationIds);
  return activeIds.filter((id) => !scheduledSet.has(id));
}

export function findOrphanScheduledIds(
  activeIds: string[],
  scheduledNotificationIds: string[],
) {
  const activeSet = new Set(activeIds);
  return scheduledNotificationIds.filter((id) => !activeSet.has(id));
}
