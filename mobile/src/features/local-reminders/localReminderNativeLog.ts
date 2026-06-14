export function logReminderCreateRequest(params: {
  id: string;
  text: string;
  triggerAt: string;
  sourceTranscript: string;
  skipped?: boolean;
  skipReason?: string;
}) {
  console.log('REMINDER_CREATE_REQUEST', params);
}

export function logReminderScheduled(params: {
  reminderId: string;
  scheduled: boolean;
  verifiedInOsQueue: boolean;
  failureReason?: string;
}) {
  console.log('REMINDER_SCHEDULED', params);
}

export function logNotificationId(params: {
  reminderId: string;
  notificationId: string | null;
}) {
  console.log('NOTIFICATION_ID', params);
}

export function logNotificationTriggerAt(params: {
  reminderId: string;
  triggerAt: string;
  triggerType: 'date';
  delayMs: number;
}) {
  console.log('NOTIFICATION_TRIGGER_AT', params);
}

export function logNotificationChannelId(params: {
  reminderId: string;
  channelId: string;
}) {
  console.log('NOTIFICATION_CHANNEL_ID', params);
}

export function logExactAlarmPermissionStatus(params: {
  platform: string;
  androidApiLevel: number | null;
  exactAlarmsRequired: boolean;
  canScheduleExactAlarms: boolean | null;
  schedulingMode: 'exact' | 'inexact_fallback' | 'not_applicable';
  notificationsGranted: boolean | null;
  samsungBatteryOptimizationNote: string;
}) {
  console.log('EXACT_ALARM_PERMISSION_STATUS', params);
}

export function logReminderNativeScheduled(params: {
  id: string;
  scheduledAt: string;
  notificationId: string;
  exactAlarmMode: 'exact' | 'inexact_fallback' | 'not_android';
}) {
  console.log('REMINDER_NATIVE_SCHEDULED', params);
}

export function logReminderNotificationFired(params: {
  id: string;
  title: string;
  source: 'notification_received' | 'background_task' | 'last_notification_response';
}) {
  console.log('REMINDER_NOTIFICATION_FIRED', params);
}

export function logReminderNotificationTapped(params: {
  id: string;
  title: string;
}) {
  console.log('REMINDER_NOTIFICATION_TAPPED', params);
}

/** @deprecated use logExactAlarmPermissionStatus */
export function logReminderExactAlarmPermissionStatus(params: {
  platform: string;
  androidApiLevel: number | null;
  exactAlarmsRequired: boolean;
  canScheduleExactAlarms: boolean | null;
  schedulingMode: 'exact' | 'inexact_fallback' | 'not_applicable';
}) {
  logExactAlarmPermissionStatus({
    ...params,
    notificationsGranted: null,
    samsungBatteryOptimizationNote:
      'Samsung may delay/kill background alarms when battery optimization is enabled for this app.',
  });
}
