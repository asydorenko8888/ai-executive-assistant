import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import {
  deliverLocalReminderFromCoordinator,
  processPendingReminderDeliveries,
  queueReminderDeliveryForLater,
  type ReminderDeliverySource,
} from '@/src/features/local-reminders/localReminderDeliveryCoordinator';
import type { ActiveLocalReminderNotification } from '@/src/features/local-reminders/deliverLocalReminder';
import { subscribeLocalSchedulerNotificationEvents } from '@/src/features/local-scheduling/notificationSchedulerService';
import {
  logLocalReminderDueCheck,
  logLocalReminderEngineStarted,
} from '@/src/features/local-reminders/localReminderMarkers';
import {
  getLocalReminderById,
  listDueLocalReminders,
  subscribeLocalReminders,
} from '@/src/features/local-reminders/localReminderRuntimeStore';
import type { LocalReminder } from '@/src/features/local-reminders/types';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';

const FOREGROUND_POLL_INTERVAL_MS = 1000;

function pushNotification(
  setActiveNotifications: Dispatch<SetStateAction<ActiveLocalReminderNotification[]>>,
  notification: ActiveLocalReminderNotification,
) {
  setActiveNotifications((current) => {
    if (current.some((item) => item.id === notification.id)) {
      return current;
    }

    return [notification, ...current];
  });
}

export function useLocalReminderEngine(languageCode: VoiceLanguageCode) {
  const [activeNotifications, setActiveNotifications] = useState<ActiveLocalReminderNotification[]>([]);
  const isCheckingRef = useRef(false);
  const languageCodeRef = useRef(languageCode);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const engineStartedRef = useRef(false);

  useEffect(() => {
    languageCodeRef.current = languageCode;
  }, [languageCode]);

  const dismissNotification = useCallback((notificationId: string) => {
    setActiveNotifications((current) => current.filter((item) => item.id !== notificationId));
  }, []);

  const handleDeliveredNotification = useCallback((notification: ActiveLocalReminderNotification) => {
    pushNotification(setActiveNotifications, notification);
  }, []);

  const deliverReminder = useCallback(
    (
      reminder: LocalReminder,
      source: ReminderDeliverySource,
      playVoice: boolean,
    ) => {
      if (playVoice) {
        return deliverLocalReminderFromCoordinator({
          reminder,
          languageCode: languageCodeRef.current,
          source,
          playVoice: true,
          onDelivered: handleDeliveredNotification,
        });
      }

      return deliverLocalReminderFromCoordinator({
        reminder,
        languageCode: languageCodeRef.current,
        source,
        playVoice: false,
      });
    },
    [handleDeliveredNotification],
  );

  const checkDueReminders = useCallback(() => {
    if (isCheckingRef.current || appStateRef.current !== 'active') {
      return;
    }

    isCheckingRef.current = true;

    try {
      const due = listDueLocalReminders(Date.now()) ?? [];

      logLocalReminderDueCheck({ count: due.length });

      for (const reminder of due) {
        void deliverReminder(reminder, 'foreground_poll', true);
      }
    } catch (error) {
      console.error('LOCAL_REMINDER_ENGINE_ERROR', {
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      isCheckingRef.current = false;
    }
  }, [deliverReminder]);

  const runResumeCatchUp = useCallback(() => {
    void processPendingReminderDeliveries({
      languageCode: languageCodeRef.current,
      playVoice: true,
      onDelivered: handleDeliveredNotification,
    });
    checkDueReminders();
  }, [checkDueReminders, handleDeliveredNotification]);

  useEffect(() => {
    if (!engineStartedRef.current) {
      engineStartedRef.current = true;
      logLocalReminderEngineStarted();
    }

    const unsubscribeNotifications = subscribeLocalSchedulerNotificationEvents({
      onAlarmNotification: () => {},
      onReminderNotification: (reminderId, title) => {
        const reminder = getLocalReminderById(reminderId);

        if (!reminder || reminder.status !== 'scheduled') {
          return;
        }

        if (appStateRef.current === 'active') {
          void deliverReminder(reminder, 'notification_received', true);
          return;
        }

        void queueReminderDeliveryForLater({
          reminderId,
          title: title || reminder.text,
          source: 'notification_received',
        });
      },
      onReminderNotificationTapped: (reminderId) => {
        const reminder = getLocalReminderById(reminderId);

        if (!reminder || reminder.status !== 'scheduled') {
          return;
        }

        void deliverReminder(reminder, 'notification_tap', true);
      },
    });

    const unsubscribe = subscribeLocalReminders(() => {
      checkDueReminders();
    });

    runResumeCatchUp();

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;

      if (nextState === 'active') {
        runResumeCatchUp();
      }
    });

    const intervalId = setInterval(() => {
      if (appStateRef.current === 'active') {
        checkDueReminders();
      }
    }, FOREGROUND_POLL_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
      unsubscribe();
      unsubscribeNotifications();
      appStateSubscription.remove();
    };
  }, [checkDueReminders, deliverReminder, runResumeCatchUp]);

  return {
    activeNotifications,
    dismissNotification,
  };
}

export type { ActiveLocalReminderNotification };
