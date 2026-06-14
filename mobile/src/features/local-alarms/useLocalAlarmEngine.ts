import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import {
  markAlarmDeliveredFromCoordinator,
  processPendingAlarmDeliveries,
  queueAlarmDeliveryForLater,
  type AlarmDeliverySource,
} from '@/src/features/local-alarms/localAlarmDeliveryCoordinator';
import {
  logAlarmRepeat,
  logAlarmSnoozed,
  logAlarmStarted,
  logAlarmStopped,
  logLocalAlarmDueCheck,
  logLocalAlarmEngineStarted,
} from '@/src/features/local-alarms/localAlarmMarkers';
import {
  syncLocalAlarmNotificationCancel,
} from '@/src/features/local-alarms/localAlarmNotificationSync';
import { subscribeLocalAlarmNotificationEvents } from '@/src/features/local-alarms/localAlarmNotificationService';
import { rescheduleScheduledItem } from '@/src/features/local-scheduling/notificationSchedulerService';
import {
  ALARM_VOICE_REPEAT_INTERVAL_MS,
  buildActiveAlarmSession,
  type ActiveAlarmSession,
} from '@/src/features/local-alarms/localAlarmSession';
import {
  getLocalAlarmById,
  listDueLocalAlarms,
  markLocalAlarmRinging,
  snoozeLocalAlarm,
  stopLocalAlarm,
  subscribeLocalAlarms,
} from '@/src/features/local-alarms/localAlarmRuntimeStore';
import type { LocalAlarm } from '@/src/features/local-alarms/types';
import { playLocalAlarmVoice } from '@/src/features/local-alarms/localAlarmVoice';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';

const POLL_INTERVAL_MS = 1000;

export function useLocalAlarmEngine(languageCode: VoiceLanguageCode) {
  const [activeSessions, setActiveSessions] = useState<ActiveAlarmSession[]>([]);
  const isCheckingRef = useRef(false);
  const languageCodeRef = useRef(languageCode);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const engineStartedRef = useRef(false);
  const activeSessionIdsRef = useRef(new Set<string>());
  const repeatTimersRef = useRef(new Map<string, ReturnType<typeof setInterval>>());

  useEffect(() => {
    languageCodeRef.current = languageCode;
  }, [languageCode]);

  const syncActiveSessions = useCallback((sessions: ActiveAlarmSession[]) => {
    activeSessionIdsRef.current = new Set(sessions.map((session) => session.alarmId));
    setActiveSessions(sessions);
  }, []);

  const clearRepeatTimer = useCallback((alarmId: string) => {
    const timerId = repeatTimersRef.current.get(alarmId);

    if (timerId) {
      clearInterval(timerId);
      repeatTimersRef.current.delete(alarmId);
    }
  }, []);

  const playSessionVoice = useCallback((session: ActiveAlarmSession, isRepeat: boolean) => {
    if (isRepeat) {
      logAlarmRepeat({
        id: session.alarmId,
        title: session.title,
      });
    }

    playLocalAlarmVoice({
      alarmId: session.alarmId,
      title: session.title,
      voiceText: session.voiceText,
      snoozeCount: session.snoozeCount,
      languageCode: languageCodeRef.current,
    });
  }, []);

  const removeSession = useCallback(
    (alarmId: string) => {
      clearRepeatTimer(alarmId);

      setActiveSessions((current) => {
        const next = current.filter((session) => session.alarmId !== alarmId);
        activeSessionIdsRef.current = new Set(next.map((session) => session.alarmId));
        return next;
      });
    },
    [clearRepeatTimer],
  );

  const startAlarmSession = useCallback(
    (alarm: LocalAlarm, source: AlarmDeliverySource = 'foreground_poll') => {
      if (activeSessionIdsRef.current.has(alarm.id)) {
        return;
      }

      markAlarmDeliveredFromCoordinator(alarm.id);
      markLocalAlarmRinging(alarm.id);

      const ringingAlarm = getLocalAlarmById(alarm.id) ?? alarm;
      const session = buildActiveAlarmSession(ringingAlarm, languageCodeRef.current);

      logAlarmStarted({
        id: session.alarmId,
        title: session.title,
      });

      if (appStateRef.current === 'active' || source === 'notification_tap') {
        playSessionVoice(session, false);

        const repeatTimerId = setInterval(() => {
          playSessionVoice(session, true);
        }, ALARM_VOICE_REPEAT_INTERVAL_MS);

        repeatTimersRef.current.set(alarm.id, repeatTimerId);
      }

      setActiveSessions((current) => {
        if (current.some((item) => item.alarmId === session.alarmId)) {
          return current;
        }

        const next = [session, ...current];
        activeSessionIdsRef.current = new Set(next.map((item) => item.alarmId));
        return next;
      });
    },
    [playSessionVoice],
  );

  const stopAlarmSession = useCallback(
    (alarmId: string) => {
      const alarm = getLocalAlarmById(alarmId);

      stopLocalAlarm(alarmId);
      syncLocalAlarmNotificationCancel(alarmId);
      logAlarmStopped({
        id: alarmId,
        title: alarm?.title ?? alarmId,
      });
      removeSession(alarmId);
    },
    [removeSession],
  );

  const snoozeAlarmSession = useCallback(
    (alarmId: string, snoozeMinutes: number) => {
      const alarm = getLocalAlarmById(alarmId);

      snoozeLocalAlarm(alarmId, snoozeMinutes);
      const snoozedAlarm = getLocalAlarmById(alarmId);

      if (snoozedAlarm) {
        void rescheduleScheduledItem(
          alarmId,
          'alarm',
          new Date(snoozedAlarm.triggerAtMs).toISOString(),
          {
            snoozeCount: snoozedAlarm.snoozeCount,
            status: 'snoozed',
          },
        );
      }

      logAlarmSnoozed({
        id: alarmId,
        title: alarm?.title ?? alarmId,
        snoozeMinutes,
      });
      removeSession(alarmId);
    },
    [removeSession],
  );

  const checkDueAlarms = useCallback(() => {
    if (isCheckingRef.current || appStateRef.current !== 'active') {
      return;
    }

    isCheckingRef.current = true;

    try {
      const due = listDueLocalAlarms(Date.now()) ?? [];

      logLocalAlarmDueCheck({ count: due.length });

      for (const alarm of due) {
        if (activeSessionIdsRef.current.has(alarm.id)) {
          continue;
        }

        startAlarmSession(alarm, 'foreground_poll');
      }
    } catch (error) {
      console.error('LOCAL_ALARM_ENGINE_ERROR', {
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      isCheckingRef.current = false;
    }
  }, [startAlarmSession]);

  const runResumeCatchUp = useCallback(() => {
    void processPendingAlarmDeliveries({
      languageCode: languageCodeRef.current,
      onAlarmReady: (alarm, source) => {
        startAlarmSession(alarm, source);
      },
    });
    checkDueAlarms();
  }, [checkDueAlarms, startAlarmSession]);

  useEffect(() => {
    if (!engineStartedRef.current) {
      engineStartedRef.current = true;
      logLocalAlarmEngineStarted();
    }

    const unsubscribeNotifications = subscribeLocalAlarmNotificationEvents({
      onAlarmNotification: (alarmId) => {
        const alarm = getLocalAlarmById(alarmId);

        if (!alarm || alarm.status === 'stopped' || alarm.status === 'cancelled') {
          return;
        }

        if (activeSessionIdsRef.current.has(alarmId)) {
          return;
        }

        if (appStateRef.current === 'active') {
          startAlarmSession(alarm, 'notification_received');
          return;
        }

        void queueAlarmDeliveryForLater({
          alarmId,
          title: alarm.title,
          source: 'notification_received',
        });
      },
    });

    const unsubscribe = subscribeLocalAlarms(() => {
      checkDueAlarms();
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
        checkDueAlarms();
      }
    }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
      unsubscribe();
      unsubscribeNotifications();
      appStateSubscription.remove();

      for (const timerId of repeatTimersRef.current.values()) {
        clearInterval(timerId);
      }

      repeatTimersRef.current.clear();
      syncActiveSessions([]);
    };
  }, [checkDueAlarms, runResumeCatchUp, startAlarmSession, syncActiveSessions]);

  return {
    activeSessions,
    stopAlarmSession,
    snoozeAlarmSession,
  };
}

export type { ActiveAlarmSession };
