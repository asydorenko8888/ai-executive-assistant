import { Platform } from 'react-native';

import { logAlarmScheduledExact } from '@/src/features/local-alarms/localAlarmMarkers';
import { registerLocalReminderBackgroundNotificationTask } from '@/src/features/local-reminders/localReminderBackgroundTask';
import {
  logExactAlarmPermissionStatus,
  logNotificationChannelId,
  logNotificationId,
  logNotificationTriggerAt,
  logReminderNativeScheduled,
} from '@/src/features/local-reminders/localReminderNativeLog';
import {
  findMissingScheduledIds,
  findOrphanScheduledIds,
  partitionPersistedItemsForHydrate,
  persistedAlarmToRuntime,
  persistedReminderToRuntime,
  runtimeAlarmToSchedulePayload,
  runtimeReminderToSchedulePayload,
} from '@/src/features/local-scheduling/hydratePersistedItems';
import {
  loadPersistedLocalAlarms,
  savePersistedLocalAlarms,
  updatePersistedLocalAlarmStatus,
  upsertPersistedLocalAlarm,
} from '@/src/features/local-scheduling/localAlarmStore';
import {
  logLocalNotificationCancelled,
  logLocalNotificationFired,
  logLocalNotificationReconcile,
  logLocalNotificationScheduled,
  logLocalSchedulerHydrateDone,
  logLocalSchedulerHydrateStart,
} from '@/src/features/local-scheduling/localSchedulerLog';
import {
  loadPersistedLocalReminders,
  savePersistedLocalReminders,
  updatePersistedLocalReminderStatus,
  upsertPersistedLocalReminder,
} from '@/src/features/local-scheduling/localReminderStore';
import type {
  ScheduleAlarmPayload,
  ScheduleReminderPayload,
} from '@/src/features/local-scheduling/types';
import { hydrateRuntimeAlarmsFromPersisted } from '@/src/features/local-alarms/localAlarmRuntimeStore';
import { hydrateRuntimeRemindersFromPersisted } from '@/src/features/local-reminders/localReminderRuntimeStore';
import {
  LOCAL_REMINDER_NOTIFICATION_SOUND,
} from '@/src/features/local-scheduling/reminderNotificationSound';

export const LOCAL_ALARM_NOTIFICATION_CHANNEL_ID = 'executive-local-alarms';
/** Bump when Android caches channel settings (sound/vibration are immutable per channel id). */
export const LOCAL_REMINDER_NOTIFICATION_CHANNEL_ID = 'reminders_v4';

type NotificationsModule = typeof import('expo-notifications');

let bootstrapPromise: Promise<void> | null = null;
let notificationsModulePromise: Promise<NotificationsModule | null> | null = null;
let hydratePromise: Promise<void> | null = null;
let exactAlarmStatusLogged = false;
let exactAlarmSettingsPrompted = false;

export type ExactAlarmSchedulingMode = 'exact' | 'inexact_fallback' | 'not_applicable';

export type ReminderScheduleResult = {
  scheduled: boolean;
  verifiedInOsQueue: boolean;
  notificationId: string | null;
  failureReason?: string;
};

const SAMSUNG_BATTERY_OPTIMIZATION_NOTE =
  'Samsung may block locked-screen delivery when battery optimization is enabled (Settings → Apps → [app] → Battery → Unrestricted).';

function isNativeMobilePlatform() {
  return Platform.OS === 'android' || Platform.OS === 'ios';
}

async function loadNotificationsModule(): Promise<NotificationsModule | null> {
  if (!isNativeMobilePlatform()) {
    return null;
  }

  if (!notificationsModulePromise) {
    notificationsModulePromise = import('expo-notifications')
      .then((module) => module)
      .catch((error) => {
        console.error('LOCAL_SCHEDULER_NOTIFICATIONS_MODULE_UNAVAILABLE', {
          message: error instanceof Error ? error.message : String(error),
        });
        return null;
      });
  }

  return notificationsModulePromise;
}

async function configureAndroidChannels(Notifications: NotificationsModule) {
  if (Platform.OS !== 'android') {
    return;
  }

  const { AndroidImportance, AndroidAudioContentType, AndroidAudioUsage, AndroidNotificationVisibility } =
    Notifications;

  await Notifications.setNotificationChannelAsync(LOCAL_ALARM_NOTIFICATION_CHANNEL_ID, {
    name: 'Local Alarms',
    description: 'Exact-time alarms with sound and vibration',
    importance: AndroidImportance.MAX,
    sound: 'default',
    enableVibrate: true,
    vibrationPattern: [0, 500, 250, 500],
    bypassDnd: true,
    lockscreenVisibility: AndroidNotificationVisibility.PUBLIC,
    audioAttributes: {
      usage: AndroidAudioUsage.ALARM,
      contentType: AndroidAudioContentType.SONIFICATION,
    },
  });

  await Notifications.setNotificationChannelAsync(LOCAL_REMINDER_NOTIFICATION_CHANNEL_ID, {
    name: 'Reminders',
    description: 'Scheduled reminders with custom voice alert',
    importance: AndroidImportance.MAX,
    sound: LOCAL_REMINDER_NOTIFICATION_SOUND,
    enableVibrate: true,
    vibrationPattern: [0, 250, 250, 250],
    bypassDnd: true,
    lockscreenVisibility: AndroidNotificationVisibility.PUBLIC,
    audioAttributes: {
      usage: AndroidAudioUsage.NOTIFICATION,
      contentType: AndroidAudioContentType.SONIFICATION,
    },
  });
}

export async function resolveExactAlarmSchedulingMode(): Promise<ExactAlarmSchedulingMode> {
  if (Platform.OS !== 'android') {
    return 'not_applicable';
  }

  if (Platform.Version < 31) {
    return 'exact';
  }

  return 'inexact_fallback';
}

async function resolveExactAlarmPermissionSnapshot(
  Notifications: NotificationsModule | null,
): Promise<{
  schedulingMode: ExactAlarmSchedulingMode;
  canScheduleExactAlarms: boolean | null;
  notificationsGranted: boolean | null;
}> {
  const schedulingMode = await resolveExactAlarmSchedulingMode();
  let notificationsGranted: boolean | null = null;

  if (Notifications) {
    const permissions = await Notifications.getPermissionsAsync();
    notificationsGranted = permissions.granted;
  }

  return {
    schedulingMode,
    canScheduleExactAlarms:
      schedulingMode === 'exact' ? true : schedulingMode === 'inexact_fallback' ? false : null,
    notificationsGranted,
  };
}

async function logExactAlarmPermissionStatusOnce(
  Notifications: NotificationsModule | null,
  schedulingMode?: ExactAlarmSchedulingMode,
) {
  if (exactAlarmStatusLogged) {
    return;
  }

  exactAlarmStatusLogged = true;

  const snapshot = schedulingMode
    ? {
        schedulingMode,
        canScheduleExactAlarms:
          schedulingMode === 'exact' ? true : schedulingMode === 'inexact_fallback' ? false : null,
        notificationsGranted: Notifications
          ? (await Notifications.getPermissionsAsync()).granted
          : null,
      }
    : await resolveExactAlarmPermissionSnapshot(Notifications);

  logExactAlarmPermissionStatus({
    platform: Platform.OS,
    androidApiLevel: Platform.OS === 'android' ? Platform.Version : null,
    exactAlarmsRequired: Platform.OS === 'android' && Platform.Version >= 31,
    canScheduleExactAlarms: snapshot.canScheduleExactAlarms,
    schedulingMode:
      snapshot.schedulingMode === 'not_applicable' ? 'not_applicable' : snapshot.schedulingMode,
    notificationsGranted: snapshot.notificationsGranted,
    samsungBatteryOptimizationNote: SAMSUNG_BATTERY_OPTIMIZATION_NOTE,
  });
}

async function ensureAndroidExactAlarmPermissionIfNeeded() {
  if (Platform.OS !== 'android' || Platform.Version < 31 || exactAlarmSettingsPrompted) {
    return;
  }

  exactAlarmSettingsPrompted = true;
  await promptAndroidExactAlarmPermissionIfNeeded();
}

async function requestNotificationPermission(Notifications: NotificationsModule) {
  const current = await Notifications.getPermissionsAsync();

  if (current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
    return current;
  }

  return Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: false,
      allowSound: true,
    },
  });
}

async function promptAndroidExactAlarmPermissionIfNeeded() {
  if (Platform.OS !== 'android' || Platform.Version < 31) {
    return;
  }

  try {
    const Application = await import('expo-application');
    const IntentLauncher = await import('expo-intent-launcher');

    await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.REQUEST_SCHEDULE_EXACT_ALARM, {
      data: `package:${Application.applicationId ?? ''}`,
    });
  } catch (error) {
    console.error('LOCAL_SCHEDULER_EXACT_ALARM_SETTINGS_ERROR', {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function ensureLocalSchedulerNotificationsReady() {
  if (bootstrapPromise) {
    return bootstrapPromise;
  }

  bootstrapPromise = (async () => {
    const Notifications = await loadNotificationsModule();

    if (!Notifications) {
      return;
    }

    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const data = notification.request.content.data;
        const isScheduledLocal =
          data?.type === 'local_alarm' || data?.type === 'local_reminder';

        return {
          shouldShowAlert: true,
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: isScheduledLocal,
          shouldSetBadge: false,
        };
      },
    });

    await configureAndroidChannels(Notifications);
    await requestNotificationPermission(Notifications);
    await ensureAndroidExactAlarmPermissionIfNeeded();
    await registerLocalReminderBackgroundNotificationTask();
    await logExactAlarmPermissionStatusOnce(Notifications);
  })();

  return bootstrapPromise;
}

async function scheduleOsNotification(params: {
  id: string;
  type: 'alarm' | 'reminder';
  title: string;
  body: string;
  scheduledAtIso: string;
  channelId: string;
  extraData?: Record<string, unknown>;
}): Promise<ReminderScheduleResult> {
  const Notifications = await loadNotificationsModule();

  if (!Notifications) {
    return {
      scheduled: false,
      verifiedInOsQueue: false,
      notificationId: null,
      failureReason: 'notifications_module_unavailable',
    };
  }

  await ensureLocalSchedulerNotificationsReady();

  const schedulingMode = await resolveExactAlarmSchedulingMode();
  await logExactAlarmPermissionStatusOnce(Notifications, schedulingMode);

  const triggerDate = new Date(params.scheduledAtIso);
  const delayMs = triggerDate.getTime() - Date.now();

  if (params.type === 'reminder') {
    logNotificationChannelId({
      reminderId: params.id,
      channelId: params.channelId,
    });
    logNotificationTriggerAt({
      reminderId: params.id,
      triggerAt: params.scheduledAtIso,
      triggerType: 'date',
      delayMs,
    });
  }

  if (triggerDate.getTime() <= Date.now()) {
    return {
      scheduled: false,
      verifiedInOsQueue: false,
      notificationId: null,
      failureReason: 'trigger_in_past',
    };
  }

  await Notifications.cancelScheduledNotificationAsync(params.id);

  const notificationSound =
    params.type === 'reminder' || params.type === 'alarm'
      ? LOCAL_REMINDER_NOTIFICATION_SOUND
      : 'default';

  let notificationId: string;

  try {
    notificationId = await Notifications.scheduleNotificationAsync({
      identifier: params.id,
      content: {
        title: params.title,
        body: params.body,
        sound: notificationSound,
        priority: Notifications.AndroidNotificationPriority.MAX,
        sticky: params.type === 'alarm',
        autoDismiss: params.type === 'reminder',
        ...(Platform.OS === 'android'
          ? { vibrate: [0, 500, 250, 500] }
          : {}),
        data: {
          type: params.type === 'alarm' ? 'local_alarm' : 'local_reminder',
          itemId: params.id,
          title: params.title,
          ...params.extraData,
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
        channelId: params.channelId,
      },
    });
  } catch (error) {
    return {
      scheduled: false,
      verifiedInOsQueue: false,
      notificationId: null,
      failureReason: error instanceof Error ? error.message : String(error),
    };
  }

  if (params.type === 'reminder') {
    logNotificationId({
      reminderId: params.id,
      notificationId,
    });
  }

  const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
  const verifiedInOsQueue = scheduledNotifications.some(
    (entry) => entry.identifier === notificationId,
  );

  logLocalNotificationScheduled({
    id: params.id,
    type: params.type,
    scheduledAt: params.scheduledAtIso,
    notificationId,
    verifiedInOsQueue,
  });

  if (params.type === 'reminder') {
    logReminderNativeScheduled({
      id: params.id,
      scheduledAt: params.scheduledAtIso,
      notificationId,
      exactAlarmMode:
        schedulingMode === 'not_applicable' ? 'not_android' : schedulingMode,
    });
  }

  return {
    scheduled: true,
    verifiedInOsQueue,
    notificationId,
    failureReason: verifiedInOsQueue ? undefined : 'missing_from_os_queue_after_schedule',
  };
}

export async function scheduleAlarm(payload: ScheduleAlarmPayload) {
  await upsertPersistedLocalAlarm(payload);

  const result = await scheduleOsNotification({
    id: payload.id,
    type: 'alarm',
    title: payload.title,
    body: 'Alarm',
    scheduledAtIso: payload.scheduledAt,
    channelId: LOCAL_ALARM_NOTIFICATION_CHANNEL_ID,
    extraData: {
      alarmId: payload.id,
      snoozeCount: payload.snoozeCount ?? 0,
    },
  });

  if (result.scheduled) {
    logAlarmScheduledExact({
      id: payload.id,
      triggerAt: payload.scheduledAt,
      triggerAtMs: Date.parse(payload.scheduledAt),
      channelId: LOCAL_ALARM_NOTIFICATION_CHANNEL_ID,
      platform: Platform.OS,
      exactAlarmTarget: true,
    });
  }

  return result.scheduled;
}

export async function scheduleReminder(payload: ScheduleReminderPayload): Promise<ReminderScheduleResult> {
  await upsertPersistedLocalReminder(payload);

  return scheduleOsNotification({
    id: payload.id,
    type: 'reminder',
    title: payload.text,
    body: 'Reminder',
    scheduledAtIso: payload.scheduledAt,
    channelId: LOCAL_REMINDER_NOTIFICATION_CHANNEL_ID,
    extraData: {
      reminderId: payload.id,
    },
  });
}

export async function cancelScheduledItem(id: string, type: 'alarm' | 'reminder') {
  const Notifications = await loadNotificationsModule();

  if (Notifications) {
    await Notifications.cancelScheduledNotificationAsync(id);
  }

  if (type === 'alarm') {
    await updatePersistedLocalAlarmStatus(id, 'cancelled');
  } else {
    await updatePersistedLocalReminderStatus(id, 'cancelled');
  }

  logLocalNotificationCancelled({ id, type });
}

export async function rescheduleScheduledItem(
  id: string,
  type: 'alarm' | 'reminder',
  newScheduledAtIso: string,
  patch?: {
    snoozeCount?: number;
    status?: 'scheduled' | 'snoozed';
  },
) {
  if (type === 'alarm') {
    const records = await loadPersistedLocalAlarms();
    const existing = records.find((record) => record.id === id);

    if (!existing) {
      return false;
    }

    return scheduleAlarm({
      id,
      title: existing.title,
      scheduledAt: newScheduledAtIso,
      createdAt: existing.createdAt,
      sourceTranscript: existing.sourceTranscript,
      snoozeCount: patch?.snoozeCount ?? existing.snoozeCount,
      originalScheduledAt: existing.originalScheduledAt,
      status: patch?.status ?? 'snoozed',
    });
  }

  const records = await loadPersistedLocalReminders();
  const existing = records.find((record) => record.id === id);

  if (!existing) {
    return false;
  }

  const result = await scheduleReminder({
    id,
    text: existing.text,
    scheduledAt: newScheduledAtIso,
    createdAt: existing.createdAt,
    sourceTranscript: existing.sourceTranscript,
    reminderKind: existing.reminderKind,
    status: patch?.status ?? 'scheduled',
  });

  return result.scheduled;
}

export async function markScheduledItemFired(id: string, type: 'alarm' | 'reminder', title: string) {
  if (type === 'alarm') {
    await updatePersistedLocalAlarmStatus(id, 'fired');
  } else {
    await updatePersistedLocalReminderStatus(id, 'fired');
  }

  logLocalNotificationFired({ id, type, title });
}

async function markExpiredPersistedItems(referenceNowMs: number) {
  const [alarms, reminders] = await Promise.all([
    loadPersistedLocalAlarms(),
    loadPersistedLocalReminders(),
  ]);

  let expired = 0;

  const nextAlarms = alarms.map((record) => {
    if (
      (record.status === 'scheduled' || record.status === 'snoozed') &&
      Date.parse(record.scheduledAt) <= referenceNowMs
    ) {
      expired += 1;
      return { ...record, status: 'fired' as const };
    }

    return record;
  });

  const nextReminders = reminders.map((record) => record);

  await Promise.all([
    savePersistedLocalAlarms(nextAlarms),
    savePersistedLocalReminders(nextReminders),
  ]);

  return expired;
}

export async function reconcileWithExpoScheduledNotifications(referenceNowMs = Date.now()) {
  const Notifications = await loadNotificationsModule();

  if (!Notifications) {
    return { rescheduled: 0, cancelled: 0 };
  }

  await ensureLocalSchedulerNotificationsReady();

  const [alarms, reminders, scheduledNotifications] = await Promise.all([
    loadPersistedLocalAlarms(),
    loadPersistedLocalReminders(),
    Notifications.getAllScheduledNotificationsAsync(),
  ]);

  const activeAlarmIds = alarms
    .filter(
      (record) =>
        (record.status === 'scheduled' || record.status === 'snoozed') &&
        Date.parse(record.scheduledAt) > referenceNowMs,
    )
    .map((record) => record.id);
  const activeReminderIds = reminders
    .filter(
      (record) =>
        record.status === 'scheduled' && Date.parse(record.scheduledAt) > referenceNowMs,
    )
    .map((record) => record.id);
  const activeIds = [...activeAlarmIds, ...activeReminderIds];
  const scheduledIds = scheduledNotifications.map((entry) => entry.identifier);

  let rescheduled = 0;
  let cancelled = 0;

  for (const id of findMissingScheduledIds(activeIds, scheduledIds)) {
    const alarm = alarms.find((record) => record.id === id);

    if (alarm) {
      await scheduleAlarm({
        id: alarm.id,
        title: alarm.title,
        scheduledAt: alarm.scheduledAt,
        createdAt: alarm.createdAt,
        sourceTranscript: alarm.sourceTranscript,
        snoozeCount: alarm.snoozeCount,
        originalScheduledAt: alarm.originalScheduledAt,
        status: alarm.status === 'snoozed' ? 'snoozed' : 'scheduled',
      });
      rescheduled += 1;
      logLocalNotificationReconcile({ id, type: 'alarm', action: 'reschedule' });
      continue;
    }

    const reminder = reminders.find((record) => record.id === id);

    if (reminder) {
      await scheduleReminder({
        id: reminder.id,
        text: reminder.text,
        scheduledAt: reminder.scheduledAt,
        createdAt: reminder.createdAt,
        sourceTranscript: reminder.sourceTranscript,
        reminderKind: reminder.reminderKind,
        status: 'scheduled',
      });
      rescheduled += 1;
      logLocalNotificationReconcile({ id, type: 'reminder', action: 'reschedule' });
    }
  }

  for (const id of findOrphanScheduledIds(activeIds, scheduledIds)) {
    await Notifications.cancelScheduledNotificationAsync(id);
    cancelled += 1;
    logLocalNotificationReconcile({
      id,
      type: activeAlarmIds.includes(id) ? 'alarm' : 'reminder',
      action: 'cancel_orphan',
    });
  }

  return { rescheduled, cancelled };
}

export async function hydrateScheduledItemsOnStartup(referenceNow = new Date()) {
  if (hydratePromise) {
    return hydratePromise;
  }

  hydratePromise = (async () => {
    const referenceNowMs = referenceNow.getTime();
    const [alarms, reminders] = await Promise.all([
      loadPersistedLocalAlarms(),
      loadPersistedLocalReminders(),
    ]);

    logLocalSchedulerHydrateStart({
      alarmCount: alarms.length,
      reminderCount: reminders.length,
    });

    await ensureLocalSchedulerNotificationsReady();

    const expiredFromMark = await markExpiredPersistedItems(referenceNowMs);
    const [freshAlarms, freshReminders] = await Promise.all([
      loadPersistedLocalAlarms(),
      loadPersistedLocalReminders(),
    ]);

    const alarmPartition = partitionPersistedItemsForHydrate(freshAlarms, referenceNowMs);
    const reminderPartition = partitionPersistedItemsForHydrate(freshReminders, referenceNowMs);

    hydrateRuntimeAlarmsFromPersisted(alarmPartition.active.map(persistedAlarmToRuntime));
    hydrateRuntimeRemindersFromPersisted(reminderPartition.active.map(persistedReminderToRuntime));

    const reconcile = await reconcileWithExpoScheduledNotifications(referenceNowMs);

    logLocalSchedulerHydrateDone({
      hydratedAlarms: alarmPartition.active.length,
      hydratedReminders: reminderPartition.active.length,
      rescheduled: reconcile.rescheduled,
      cancelled: reconcile.cancelled,
      expired: expiredFromMark + alarmPartition.expired + reminderPartition.expired,
    });
  })().finally(() => {
    hydratePromise = null;
  });

  return hydratePromise;
}

export function subscribeLocalSchedulerNotificationEvents(params: {
  onAlarmNotification: (alarmId: string, title: string) => void;
  onReminderNotification?: (reminderId: string, title: string) => void;
  onReminderNotificationTapped?: (reminderId: string, title: string) => void;
}) {
  let receivedSubscription: { remove: () => void } | null = null;
  let responseSubscription: { remove: () => void } | null = null;
  let disposed = false;

  void (async () => {
    const Notifications = await loadNotificationsModule();

    if (!Notifications || disposed) {
      return;
    }

    await ensureLocalSchedulerNotificationsReady();

    const handleAlarmNotification = async (
      itemId: string | undefined,
      title: string | null | undefined,
    ) => {
      if (!itemId) {
        return;
      }

      await markScheduledItemFired(itemId, 'alarm', title ?? itemId);
      params.onAlarmNotification(itemId, title ?? itemId);
    };

    const handleReminderReceived = async (
      itemId: string | undefined,
      title: string | null | undefined,
    ) => {
      if (!itemId || !params.onReminderNotification) {
        return;
      }

      params.onReminderNotification(itemId, title ?? itemId);
    };

    const handleReminderTapped = async (
      itemId: string | undefined,
      title: string | null | undefined,
    ) => {
      if (!itemId || !params.onReminderNotificationTapped) {
        return;
      }

      params.onReminderNotificationTapped(itemId, title ?? itemId);
    };

    receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data;
      const itemType = data?.type;

      if (itemType !== 'local_alarm' && itemType !== 'local_reminder') {
        return;
      }

      const itemId = String(data.itemId ?? data.alarmId ?? data.reminderId ?? '');
      const title = notification.request.content.title;

      if (itemType === 'local_alarm') {
        void handleAlarmNotification(itemId, title);
        return;
      }

      void handleReminderReceived(itemId, title);
    });

    responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      const itemType = data?.type;

      if (itemType !== 'local_alarm' && itemType !== 'local_reminder') {
        return;
      }

      const itemId = String(data.itemId ?? data.alarmId ?? data.reminderId ?? '');
      const title = response.notification.request.content.title;

      if (itemType === 'local_alarm') {
        void handleAlarmNotification(itemId, title);
        return;
      }

      void handleReminderTapped(itemId, title);
    });

    const lastResponse = await Notifications.getLastNotificationResponseAsync();

    if (lastResponse) {
      const data = lastResponse.notification.request.content.data;
      const itemType = data?.type;

      if (itemType === 'local_reminder') {
        void handleReminderTapped(
          String(data.itemId ?? data.alarmId ?? data.reminderId ?? ''),
          lastResponse.notification.request.content.title,
        );
      } else if (itemType === 'local_alarm') {
        void handleAlarmNotification(
          String(data.itemId ?? data.alarmId ?? data.reminderId ?? ''),
          lastResponse.notification.request.content.title,
        );
      }
    }
  })();

  return () => {
    disposed = true;
    receivedSubscription?.remove();
    responseSubscription?.remove();
  };
}

export {
  runtimeAlarmToSchedulePayload,
  runtimeReminderToSchedulePayload,
};
