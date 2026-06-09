import type { LocalAlarm } from '@/src/features/local-alarms/types';

function isReactNativeRuntime() {
  return typeof navigator !== 'undefined' && navigator.product === 'ReactNative';
}

function logNotificationError(scope: string, id: string, error: unknown) {
  console.error(scope, {
    id,
    message: error instanceof Error ? error.message : String(error),
  });
}

export function syncLocalAlarmNotificationSchedule(alarm: LocalAlarm) {
  if (!isReactNativeRuntime()) {
    return;
  }

  void import('@/src/features/local-alarms/localAlarmNotificationService')
    .then(({ scheduleLocalAlarmNotification }) => scheduleLocalAlarmNotification(alarm))
    .catch((error) => {
      logNotificationError('LOCAL_ALARM_NOTIFICATION_SCHEDULE_ERROR', alarm.id, error);
    });
}

export function syncLocalAlarmNotificationCancel(alarmId: string) {
  if (!isReactNativeRuntime()) {
    return;
  }

  void import('@/src/features/local-alarms/localAlarmNotificationService')
    .then(({ cancelLocalAlarmNotification }) => cancelLocalAlarmNotification(alarmId))
    .catch((error) => {
      logNotificationError('LOCAL_ALARM_NOTIFICATION_CANCEL_ERROR', alarmId, error);
    });
}
