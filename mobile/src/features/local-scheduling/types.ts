export type LocalScheduledItemType = 'alarm' | 'reminder';

export type LocalScheduledPersistedStatus =
  | 'scheduled'
  | 'fired'
  | 'cancelled'
  | 'snoozed';

export type PersistedLocalAlarmRecord = {
  id: string;
  type: 'alarm';
  title: string;
  scheduledAt: string;
  createdAt: string;
  status: LocalScheduledPersistedStatus;
  notificationId: string | null;
  sourceTranscript: string;
  snoozeCount: number;
  originalScheduledAt: string;
};

export type PersistedLocalReminderRecord = {
  id: string;
  type: 'reminder';
  text: string;
  scheduledAt: string;
  createdAt: string;
  status: LocalScheduledPersistedStatus;
  notificationId: string | null;
  sourceTranscript: string;
  reminderKind: 'reminder' | 'alarm';
};

export type ScheduleAlarmPayload = {
  id: string;
  title: string;
  scheduledAt: string;
  createdAt: string;
  sourceTranscript: string;
  snoozeCount?: number;
  originalScheduledAt?: string;
  status?: LocalScheduledPersistedStatus;
};

export type ScheduleReminderPayload = {
  id: string;
  text: string;
  scheduledAt: string;
  createdAt: string;
  sourceTranscript: string;
  reminderKind?: 'reminder' | 'alarm';
  status?: LocalScheduledPersistedStatus;
};
