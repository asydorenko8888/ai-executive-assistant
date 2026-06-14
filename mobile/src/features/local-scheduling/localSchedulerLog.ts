export function logLocalSchedulerHydrateStart(params: {
  alarmCount: number;
  reminderCount: number;
}) {
  console.log('LOCAL_SCHEDULER_HYDRATE_START', params);
}

export function logLocalSchedulerHydrateDone(params: {
  hydratedAlarms: number;
  hydratedReminders: number;
  rescheduled: number;
  cancelled: number;
  expired: number;
}) {
  console.log('LOCAL_SCHEDULER_HYDRATE_DONE', params);
}

export function logLocalNotificationScheduled(params: {
  id: string;
  type: 'alarm' | 'reminder';
  scheduledAt: string;
  notificationId: string;
  verifiedInOsQueue?: boolean;
}) {
  console.log('LOCAL_NOTIFICATION_SCHEDULED', params);
}

export function logLocalNotificationFired(params: {
  id: string;
  type: 'alarm' | 'reminder';
  title: string;
}) {
  console.log('LOCAL_NOTIFICATION_FIRED', params);
}

export function logLocalNotificationCancelled(params: {
  id: string;
  type: 'alarm' | 'reminder';
}) {
  console.log('LOCAL_NOTIFICATION_CANCELLED', params);
}

export function logLocalNotificationReconcile(params: {
  id: string;
  type: 'alarm' | 'reminder';
  action: 'reschedule' | 'cancel_orphan';
}) {
  console.log('LOCAL_NOTIFICATION_RECONCILE', params);
}
