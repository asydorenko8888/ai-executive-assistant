import { NativeModules, Platform } from 'react-native';

import { queueAlarmDeliveryForLater } from '@/src/features/local-alarms/localAlarmDeliveryCoordinator';

export const LOCAL_SCHEDULING_BACKGROUND_NOTIFICATION_TASK =
  'LOCAL_SCHEDULING_BACKGROUND_NOTIFICATION_TASK';

/** @deprecated Use LOCAL_SCHEDULING_BACKGROUND_NOTIFICATION_TASK */
export const LOCAL_REMINDER_BACKGROUND_NOTIFICATION_TASK =
  LOCAL_SCHEDULING_BACKGROUND_NOTIFICATION_TASK;

function isExpoTaskManagerNativeModuleAvailable() {
  return Platform.OS !== 'web' && Boolean(NativeModules.ExpoTaskManager);
}

function extractScheduledItemFromNotificationData(data: Record<string, unknown> | undefined) {
  if (!data) {
    return null;
  }

  if (data.type === 'local_reminder') {
    const reminderId = data.itemId ?? data.reminderId;

    return typeof reminderId === 'string' && reminderId.trim()
      ? { kind: 'reminder' as const, itemId: reminderId.trim() }
      : null;
  }

  if (data.type === 'local_alarm') {
    const alarmId = data.itemId ?? data.alarmId;

    return typeof alarmId === 'string' && alarmId.trim()
      ? { kind: 'alarm' as const, itemId: alarmId.trim() }
      : null;
  }

  return null;
}

let taskDefined = false;
let registerTaskPromise: Promise<void> | null = null;

async function ensureBackgroundTaskDefined() {
  if (taskDefined) {
    return true;
  }

  if (!isExpoTaskManagerNativeModuleAvailable()) {
    console.warn('LOCAL_SCHEDULING_BACKGROUND_TASK_UNAVAILABLE', {
      reason: 'ExpoTaskManager native module missing; rebuild Android dev client after installing expo-task-manager',
    });
    return false;
  }

  const TaskManager = await import('expo-task-manager');
  const { queueReminderDeliveryForLater } = await import(
    '@/src/features/local-reminders/localReminderDeliveryCoordinator'
  );

  TaskManager.defineTask(
    LOCAL_SCHEDULING_BACKGROUND_NOTIFICATION_TASK,
    async ({ data, error }) => {
      if (error) {
        console.error('LOCAL_SCHEDULING_BACKGROUND_TASK_ERROR', {
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
      const scheduledItem = extractScheduledItemFromNotificationData(notificationData);

      if (!scheduledItem) {
        return;
      }

      const title =
        payload && 'notification' in payload
          ? String(payload.notification?.request?.content?.title ?? scheduledItem.itemId)
          : scheduledItem.itemId;

      if (scheduledItem.kind === 'alarm') {
        await queueAlarmDeliveryForLater({
          alarmId: scheduledItem.itemId,
          title,
          source: 'background_task',
        });
        return;
      }

      await queueReminderDeliveryForLater({
        reminderId: scheduledItem.itemId,
        title,
        source: 'background_task',
      });
    },
  );

  taskDefined = true;
  return true;
}

export async function registerLocalSchedulingBackgroundNotificationTask() {
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
      await Notifications.registerTaskAsync(LOCAL_SCHEDULING_BACKGROUND_NOTIFICATION_TASK);
    } catch (error) {
      console.error('LOCAL_SCHEDULING_BACKGROUND_TASK_REGISTER_ERROR', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  })();

  return registerTaskPromise;
}

/** @deprecated Use registerLocalSchedulingBackgroundNotificationTask */
export async function registerLocalReminderBackgroundNotificationTask() {
  return registerLocalSchedulingBackgroundNotificationTask();
}
