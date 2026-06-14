import { NativeModules, Platform } from 'react-native';

import { queueReminderDeliveryForLater } from '@/src/features/local-reminders/localReminderDeliveryCoordinator';

export const LOCAL_REMINDER_BACKGROUND_NOTIFICATION_TASK =
  'LOCAL_REMINDER_BACKGROUND_NOTIFICATION_TASK';

function isExpoTaskManagerNativeModuleAvailable() {
  return Platform.OS !== 'web' && Boolean(NativeModules.ExpoTaskManager);
}

function extractReminderIdFromNotificationData(data: Record<string, unknown> | undefined) {
  if (!data || data.type !== 'local_reminder') {
    return null;
  }

  const reminderId = data.itemId ?? data.reminderId;

  return typeof reminderId === 'string' && reminderId.trim() ? reminderId.trim() : null;
}

let taskDefined = false;
let registerTaskPromise: Promise<void> | null = null;

async function ensureBackgroundTaskDefined() {
  if (taskDefined) {
    return true;
  }

  if (!isExpoTaskManagerNativeModuleAvailable()) {
    console.warn('LOCAL_REMINDER_BACKGROUND_TASK_UNAVAILABLE', {
      reason: 'ExpoTaskManager native module missing; rebuild Android dev client after installing expo-task-manager',
    });
    return false;
  }

  const TaskManager = await import('expo-task-manager');

  TaskManager.defineTask(
    LOCAL_REMINDER_BACKGROUND_NOTIFICATION_TASK,
    async ({ data, error }) => {
      if (error) {
        console.error('LOCAL_REMINDER_BACKGROUND_TASK_ERROR', {
          message: error.message,
        });
        return;
      }

      const Notifications = await import('expo-notifications');
      const payload = data as Notifications.NotificationTaskPayload | undefined;
      const notificationData =
        payload && 'notification' in payload
          ? (payload.notification?.request?.content?.data as Record<string, unknown> | undefined)
          : undefined;
      const reminderId = extractReminderIdFromNotificationData(notificationData);

      if (!reminderId) {
        return;
      }

      const title =
        payload && 'notification' in payload
          ? String(payload.notification?.request?.content?.title ?? reminderId)
          : reminderId;

      await queueReminderDeliveryForLater({
        reminderId,
        title,
        source: 'background_task',
      });
    },
  );

  taskDefined = true;
  return true;
}

export async function registerLocalReminderBackgroundNotificationTask() {
  if (registerTaskPromise) {
    return registerTaskPromise;
  }

  registerTaskPromise = (async () => {
    try {
      const ready = await ensureBackgroundTaskDefined();

      if (!ready) {
        return;
      }

      const Notifications = await import('expo-notifications');
      await Notifications.registerTaskAsync(LOCAL_REMINDER_BACKGROUND_NOTIFICATION_TASK);
    } catch (error) {
      console.error('LOCAL_REMINDER_BACKGROUND_TASK_REGISTER_ERROR', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  })();

  return registerTaskPromise;
}
