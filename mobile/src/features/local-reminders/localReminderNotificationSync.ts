import {
  logReminderCreateRequest,
  logReminderScheduled,
} from '@/src/features/local-reminders/localReminderNativeLog';
import type { LocalReminder } from '@/src/features/local-reminders/types';

function isReactNativeRuntime() {
  return typeof navigator !== 'undefined' && navigator.product === 'ReactNative';
}

function logNotificationError(scope: string, id: string, error: unknown) {
  console.error(scope, {
    id,
    message: error instanceof Error ? error.message : String(error),
  });
}

export function syncLocalReminderNotificationSchedule(reminder: LocalReminder) {
  if (!isReactNativeRuntime()) {
    logReminderCreateRequest({
      id: reminder.id,
      text: reminder.text,
      triggerAt: new Date(reminder.triggerAtMs).toISOString(),
      sourceTranscript: reminder.sourceTranscript,
      skipped: true,
      skipReason: 'not_react_native_runtime',
    });

    return;
  }

  logReminderCreateRequest({
    id: reminder.id,
    text: reminder.text,
    triggerAt: new Date(reminder.triggerAtMs).toISOString(),
    sourceTranscript: reminder.sourceTranscript,
  });

  void import('@/src/features/local-scheduling/notificationSchedulerService')
    .then(({ scheduleReminder, runtimeReminderToSchedulePayload }) =>
      scheduleReminder(runtimeReminderToSchedulePayload(reminder)),
    )
    .then((result) => {
      logReminderScheduled({
        reminderId: reminder.id,
        scheduled: result.scheduled,
        verifiedInOsQueue: result.verifiedInOsQueue,
        failureReason: result.failureReason,
      });
    })
    .catch((error) => {
      logNotificationError('LOCAL_REMINDER_NOTIFICATION_SCHEDULE_ERROR', reminder.id, error);
      logReminderScheduled({
        reminderId: reminder.id,
        scheduled: false,
        verifiedInOsQueue: false,
        failureReason: error instanceof Error ? error.message : String(error),
      });
    });
}

export function syncLocalReminderNotificationCancel(reminderId: string) {
  if (!isReactNativeRuntime()) {
    return;
  }

  void import('@/src/features/local-scheduling/notificationSchedulerService')
    .then(({ cancelScheduledItem }) => cancelScheduledItem(reminderId, 'reminder'))
    .catch((error) => {
      logNotificationError('LOCAL_REMINDER_NOTIFICATION_CANCEL_ERROR', reminderId, error);
    });
}
