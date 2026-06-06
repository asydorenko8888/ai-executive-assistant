/** Hardcoded popup reminder for app-created/updated calendar events. */
export const CALENDAR_EVENT_REMINDER_MINUTES = 30;

export const GOOGLE_CALENDAR_EVENT_REMINDERS = {
  useDefault: false,
  overrides: [
    {
      method: 'popup' as const,
      minutes: CALENDAR_EVENT_REMINDER_MINUTES,
    },
  ],
};

export function attachGoogleCalendarEventReminders<T extends Record<string, unknown>>(body: T) {
  return {
    ...body,
    reminders: GOOGLE_CALENDAR_EVENT_REMINDERS,
  };
}

export function logCalendarEventReminderSet(params: {
  eventId: string;
  title: string;
  minutes?: number;
}) {
  console.error('CALENDAR_EVENT_REMINDER_SET', {
    eventId: params.eventId,
    title: params.title,
    minutes: params.minutes ?? CALENDAR_EVENT_REMINDER_MINUTES,
  });
}
