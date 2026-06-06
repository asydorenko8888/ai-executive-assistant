import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

import { refreshCalendarAuthCapabilities } from '@/src/features/agent/calendar/calendarAuthCapabilities';
import { deliverCalendarReminderAnnouncement } from '@/src/features/calendar-reminder-engine/deliverCalendarReminder';
import {
  loadAnnouncedCalendarReminderKeys,
  markCalendarReminderAnnounced,
} from '@/src/features/calendar-reminder-engine/calendarReminderDedupStorage';
import { fetchCalendarEventsForReminderEngine } from '@/src/features/calendar-reminder-engine/calendarReminderEventSource';
import {
  CALENDAR_REMINDER_OFFSET_MINUTES,
  CALENDAR_REMINDER_POLL_INTERVAL_MS,
} from '@/src/features/calendar-reminder-engine/constants';
import { findCalendarRemindersDue } from '@/src/features/calendar-reminder-engine/scanCalendarReminders';
import type { ActiveCalendarReminderNotification } from '@/src/features/calendar-reminder-engine/types';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguageLocale';

type UseCalendarReminderEngineOptions = {
  languageCode: VoiceLanguageCode;
  pollIntervalMs?: number;
};

function pushNotification(
  setActiveNotifications: Dispatch<SetStateAction<ActiveCalendarReminderNotification[]>>,
  notification: ActiveCalendarReminderNotification,
) {
  setActiveNotifications((current) => {
    if (current.some((item) => item.id === notification.id)) {
      return current;
    }

    return [notification, ...current];
  });
}

export function useCalendarReminderEngine({
  languageCode,
  pollIntervalMs = CALENDAR_REMINDER_POLL_INTERVAL_MS,
}: UseCalendarReminderEngineOptions) {
  const [activeNotifications, setActiveNotifications] = useState<ActiveCalendarReminderNotification[]>([]);
  const isCheckingRef = useRef(false);
  const languageCodeRef = useRef(languageCode);

  useEffect(() => {
    languageCodeRef.current = languageCode;
  }, [languageCode]);

  const dismissNotification = useCallback((notificationId: string) => {
    setActiveNotifications((current) => current.filter((item) => item.id !== notificationId));
  }, []);

  const announceReminder = useCallback(
    async (params: {
      eventId: string;
      eventTitle: string;
      startsAt: string;
      offsetMinutes?: number;
      source?: string;
    }) => {
      const notification = await deliverCalendarReminderAnnouncement({
        ...params,
        languageCode: languageCodeRef.current,
      });

      pushNotification(setActiveNotifications, notification);
      return notification;
    },
    [],
  );

  const checkCalendarReminders = useCallback(async () => {
    if (isCheckingRef.current) {
      return;
    }

    isCheckingRef.current = true;

    try {
      const auth = await refreshCalendarAuthCapabilities();

      if (!auth.canReadCalendar) {
        return;
      }

      const referenceNow = new Date();
      const [events, announcedKeys] = await Promise.all([
        fetchCalendarEventsForReminderEngine(referenceNow),
        loadAnnouncedCalendarReminderKeys(),
      ]);

      const dueReminders = findCalendarRemindersDue({
        events,
        referenceNow,
        announcedKeys,
        offsetMinutes: CALENDAR_REMINDER_OFFSET_MINUTES,
      });

      for (const reminder of dueReminders) {
        await markCalendarReminderAnnounced(reminder.dedupeKey);
        await announceReminder({
          eventId: reminder.event.id,
          eventTitle: reminder.event.title,
          startsAt: reminder.event.startsAt,
          offsetMinutes: CALENDAR_REMINDER_OFFSET_MINUTES,
          source: 'engine',
        });
      }
    } catch (error) {
      console.log('[CalendarReminderEngine] check failed', {
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      isCheckingRef.current = false;
    }
  }, [announceReminder]);

  useEffect(() => {
    void checkCalendarReminders();

    const intervalId = setInterval(() => {
      void checkCalendarReminders();
    }, pollIntervalMs);

    return () => {
      clearInterval(intervalId);
    };
  }, [checkCalendarReminders, pollIntervalMs]);

  return {
    activeNotifications,
    dismissNotification,
    announceReminder,
  };
}
