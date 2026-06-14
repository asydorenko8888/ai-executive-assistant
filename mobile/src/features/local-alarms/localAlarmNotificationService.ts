import {
  ensureLocalSchedulerNotificationsReady,
  LOCAL_ALARM_NOTIFICATION_CHANNEL_ID,
  subscribeLocalSchedulerNotificationEvents,
} from '@/src/features/local-scheduling/notificationSchedulerService';

export { LOCAL_ALARM_NOTIFICATION_CHANNEL_ID };

export async function ensureLocalAlarmNotificationsReady() {
  return ensureLocalSchedulerNotificationsReady();
}

export function subscribeLocalAlarmNotificationEvents(params: {
  onAlarmNotification: (alarmId: string) => void;
}) {
  return subscribeLocalSchedulerNotificationEvents({
    onAlarmNotification: (alarmId) => {
      params.onAlarmNotification(alarmId);
    },
  });
}
