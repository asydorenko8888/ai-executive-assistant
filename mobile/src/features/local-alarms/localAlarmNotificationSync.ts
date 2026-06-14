import type { LocalAlarm } from '@/src/features/local-alarms/types';
import { devConsoleLog } from '@/src/shared/logging/devConsoleLog';

function isReactNativeRuntime() {
  return typeof navigator !== 'undefined' && navigator.product === 'ReactNative';
}

function logNotificationError(scope: string, id: string, error: unknown) {
  devConsoleLog(scope, {
    id,
    message: error instanceof Error ? error.message : String(error),
  });
}

export function syncLocalAlarmNotificationSchedule(alarm: LocalAlarm) {
  if (!isReactNativeRuntime()) {
    return;
  }

  void import('@/src/features/local-scheduling/notificationSchedulerService')
    .then(({ scheduleAlarm, runtimeAlarmToSchedulePayload }) =>
      scheduleAlarm(runtimeAlarmToSchedulePayload(alarm)),
    )
    .catch((error) => {
      logNotificationError('LOCAL_ALARM_NOTIFICATION_SCHEDULE_ERROR', alarm.id, error);
    });
}

export function syncLocalAlarmNotificationCancel(alarmId: string) {
  if (!isReactNativeRuntime()) {
    return;
  }

  void import('@/src/features/local-scheduling/notificationSchedulerService')
    .then(({ cancelScheduledItem }) => cancelScheduledItem(alarmId, 'alarm'))
    .catch((error) => {
      logNotificationError('LOCAL_ALARM_NOTIFICATION_CANCEL_ERROR', alarmId, error);
    });
}
