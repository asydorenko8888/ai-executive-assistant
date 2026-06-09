import { Platform } from 'react-native';

import {
  logAlarmNotificationFired,
  logAlarmPermissionStatus,
  logAlarmScheduledExact,
} from '@/src/features/local-alarms/localAlarmMarkers';
import type { LocalAlarm } from '@/src/features/local-alarms/types';

export const LOCAL_ALARM_NOTIFICATION_CHANNEL_ID = 'executive-local-alarms';

type NotificationsModule = typeof import('expo-notifications');

let bootstrapPromise: Promise<void> | null = null;
let notificationsModulePromise: Promise<NotificationsModule | null> | null = null;

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
        console.error('LOCAL_ALARM_NOTIFICATIONS_MODULE_UNAVAILABLE', {
          message: error instanceof Error ? error.message : String(error),
        });
        return null;
      });
  }

  return notificationsModulePromise;
}

async function configureAndroidAlarmChannel(Notifications: NotificationsModule) {
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
    return 'unsupported';
  }

  try {
    const Application = await import('expo-application');
    const IntentLauncher = await import('expo-intent-launcher');

    await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.REQUEST_SCHEDULE_EXACT_ALARM, {
      data: `package:${Application.applicationId ?? ''}`,
    });

    return 'settings_prompt_shown';
  } catch (error) {
    console.error('LOCAL_ALARM_EXACT_ALARM_SETTINGS_ERROR', {
      message: error instanceof Error ? error.message : String(error),
    });
    return 'settings_prompt_failed';
  }
}

async function readAlarmPermissionStatus(Notifications: NotificationsModule) {
  const permissions = await Notifications.getPermissionsAsync();

  let exactAlarm: string;

  if (Platform.OS !== 'android') {
    exactAlarm = 'unsupported';
  } else if (Platform.Version < 31) {
    exactAlarm = 'android_below_12';
  } else {
    exactAlarm = 'requires_os_grant';
  }

  const status = {
    platform: Platform.OS,
    notifications: permissions.status,
    exactAlarm,
  };

  logAlarmPermissionStatus(status);
  return status;
}

export async function ensureLocalAlarmNotificationsReady() {
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
        const isAlarm = data?.type === 'local_alarm';

        return {
          shouldShowAlert: true,
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: isAlarm,
          shouldSetBadge: false,
        };
      },
    });

    await configureAndroidAlarmChannel(Notifications);
    await requestNotificationPermission(Notifications);
    await readAlarmPermissionStatus(Notifications);
  })();

  return bootstrapPromise;
}

export async function scheduleLocalAlarmNotification(alarm: LocalAlarm) {
  const Notifications = await loadNotificationsModule();

  if (!Notifications) {
    return false;
  }

  await ensureLocalAlarmNotificationsReady();

  if (Platform.OS === 'android' && Platform.Version >= 31) {
    await promptAndroidExactAlarmPermissionIfNeeded();
  }

  const triggerDate = new Date(alarm.triggerAtMs);

  if (triggerDate.getTime() <= Date.now()) {
    return false;
  }

  await Notifications.cancelScheduledNotificationAsync(alarm.id);

  await Notifications.scheduleNotificationAsync({
    identifier: alarm.id,
    content: {
      title: alarm.title,
      body: 'Alarm',
      sound: 'default',
      priority: Notifications.AndroidNotificationPriority.MAX,
      sticky: true,
      autoDismiss: false,
      data: {
        type: 'local_alarm',
        alarmId: alarm.id,
        title: alarm.title,
        snoozeCount: alarm.snoozeCount,
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
      channelId: LOCAL_ALARM_NOTIFICATION_CHANNEL_ID,
    },
  });

  logAlarmScheduledExact({
    id: alarm.id,
    triggerAt: triggerDate.toISOString(),
    triggerAtMs: alarm.triggerAtMs,
    channelId: LOCAL_ALARM_NOTIFICATION_CHANNEL_ID,
    platform: Platform.OS,
    exactAlarmTarget: Platform.OS === 'android',
  });

  return true;
}

export async function cancelLocalAlarmNotification(alarmId: string) {
  const Notifications = await loadNotificationsModule();

  if (!Notifications) {
    return;
  }

  await Notifications.cancelScheduledNotificationAsync(alarmId);
}

export function subscribeLocalAlarmNotificationEvents(params: {
  onAlarmNotification: (alarmId: string) => void;
}) {
  let receivedSubscription: { remove: () => void } | null = null;
  let responseSubscription: { remove: () => void } | null = null;
  let disposed = false;

  void (async () => {
    const Notifications = await loadNotificationsModule();

    if (!Notifications || disposed) {
      return;
    }

    await ensureLocalAlarmNotificationsReady();

    const handleNotification = (alarmId: string | undefined, title: string | null | undefined) => {
      if (!alarmId) {
        return;
      }

      logAlarmNotificationFired({
        id: alarmId,
        title: title ?? alarmId,
      });
      params.onAlarmNotification(alarmId);
    };

    receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data;

      if (data?.type !== 'local_alarm') {
        return;
      }

      handleNotification(String(data.alarmId ?? ''), notification.request.content.title);
    });

    responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;

      if (data?.type !== 'local_alarm') {
        return;
      }

      handleNotification(String(data.alarmId ?? ''), response.notification.request.content.title);
    });

    const lastResponse = await Notifications.getLastNotificationResponseAsync();

    if (lastResponse?.notification.request.content.data?.type === 'local_alarm') {
      handleNotification(
        String(lastResponse.notification.request.content.data.alarmId ?? ''),
        lastResponse.notification.request.content.title,
      );
    }
  })();

  return () => {
    disposed = true;
    receivedSubscription?.remove();
    responseSubscription?.remove();
  };
}
