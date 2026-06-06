import { Platform } from 'react-native';

import type { ActiveCalendarReminderNotification } from '@/src/features/calendar-reminder-engine/types';

export function tryPresentSystemNotification(params: {
  title: string;
  body: string;
}) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return;
  }

  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  try {
    new Notification(params.title, { body: params.body });
  } catch (error) {
    console.log('[CalendarReminderEngine] system notification failed', {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

export function buildActiveCalendarReminderNotification(params: {
  eventId: string;
  eventTitle: string;
  message: string;
  startsAt: string;
}): ActiveCalendarReminderNotification {
  return {
    id: `${params.eventId}|${params.startsAt}`,
    eventTitle: params.eventTitle,
    message: params.message,
    startsAt: params.startsAt,
    triggeredAt: new Date().toISOString(),
  };
}
