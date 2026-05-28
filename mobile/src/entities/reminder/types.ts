import type { NotificationChannel } from '@/src/entities/notification/types';

export type ReminderStatus = 'scheduled' | 'completed' | 'cancelled' | 'snoozed';

export type ReminderRecurrence = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly';

export type ReminderItem = {
  id: string;
  title: string;
  notes?: string;
  scheduledFor: string;
  leadTimeMinutes: number;
  channel: NotificationChannel;
  recurrence: ReminderRecurrence;
  status: ReminderStatus;
  relatedTaskId?: string;
  createdAt: string;
  updatedAt: string;
};
