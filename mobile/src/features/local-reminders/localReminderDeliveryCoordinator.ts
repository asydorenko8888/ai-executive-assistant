import {
  deliverLocalReminderAnnouncement,
  type ActiveLocalReminderNotification,
} from '@/src/features/local-reminders/deliverLocalReminder';
import {
  logReminderNotificationFired,
  logReminderNotificationTapped,
} from '@/src/features/local-reminders/localReminderNativeLog';
import {
  listPendingReminderDeliveries,
  queuePendingReminderDelivery,
  removePendingReminderDelivery,
} from '@/src/features/local-reminders/localReminderPendingDelivery';
import {
  getLocalReminderById,
  markLocalReminderTriggered,
} from '@/src/features/local-reminders/localReminderRuntimeStore';
import type { LocalReminder } from '@/src/features/local-reminders/types';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { markScheduledItemFired } from '@/src/features/local-scheduling/notificationSchedulerService';

export type ReminderDeliverySource =
  | 'foreground_poll'
  | 'notification_received'
  | 'notification_tap'
  | 'app_resume_catchup'
  | 'pending_queue';

type DeliverReminderParams = {
  reminder: LocalReminder;
  languageCode: VoiceLanguageCode;
  source: ReminderDeliverySource;
  playVoice: boolean;
  onDelivered?: (notification: ActiveLocalReminderNotification) => void;
};

const deliveredIds = new Set<string>();

export function resetDeliveredReminderIdsForTests() {
  deliveredIds.clear();
}

export function hasDeliveredReminderId(reminderId: string) {
  return deliveredIds.has(reminderId);
}

export async function deliverLocalReminderFromCoordinator(params: DeliverReminderParams) {
  if (deliveredIds.has(params.reminder.id)) {
    return null;
  }

  deliveredIds.add(params.reminder.id);
  markLocalReminderTriggered(params.reminder.id);
  await markScheduledItemFired(params.reminder.id, 'reminder', params.reminder.text);
  await removePendingReminderDelivery(params.reminder.id);

  if (params.source === 'notification_tap') {
    logReminderNotificationTapped({
      id: params.reminder.id,
      title: params.reminder.text,
    });
  } else {
    logReminderNotificationFired({
      id: params.reminder.id,
      title: params.reminder.text,
      source:
        params.source === 'notification_received'
          ? 'notification_received'
          : params.source === 'pending_queue'
            ? 'last_notification_response'
            : 'notification_received',
    });
  }

  if (!params.playVoice) {
    return null;
  }

  const notification = deliverLocalReminderAnnouncement({
    reminder: params.reminder,
    languageCode: params.languageCode,
    source: params.source,
  });

  params.onDelivered?.(notification);
  return notification;
}

export async function queueReminderDeliveryForLater(params: {
  reminderId: string;
  title: string;
  source: string;
}) {
  logReminderNotificationFired({
    id: params.reminderId,
    title: params.title,
    source: 'background_task',
  });
  await queuePendingReminderDelivery(params);
}

export async function processPendingReminderDeliveries(params: {
  languageCode: VoiceLanguageCode;
  playVoice: boolean;
  onDelivered?: (notification: ActiveLocalReminderNotification) => void;
}) {
  const pending = await listPendingReminderDeliveries();

  for (const entry of pending) {
    const reminder = getLocalReminderById(entry.reminderId);

    if (!reminder || reminder.status !== 'scheduled') {
      await removePendingReminderDelivery(entry.reminderId);
      continue;
    }

    await deliverLocalReminderFromCoordinator({
      reminder,
      languageCode: params.languageCode,
      source: 'pending_queue',
      playVoice: params.playVoice,
      onDelivered: params.onDelivered,
    });
  }
}
