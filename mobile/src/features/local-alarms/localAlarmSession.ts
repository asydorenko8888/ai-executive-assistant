import { buildLocalAlarmTriggeredSpeech } from '@/src/features/local-alarms/localAlarmReplies';
import type { LocalAlarm } from '@/src/features/local-alarms/types';

export const ALARM_VOICE_REPEAT_INTERVAL_MS = 10_000;

export type ActiveAlarmSession = {
  alarmId: string;
  title: string;
  message: string;
  startedAtMs: number;
};

export function buildActiveAlarmSession(alarm: LocalAlarm): ActiveAlarmSession {
  return {
    alarmId: alarm.id,
    title: alarm.title,
    message: buildLocalAlarmTriggeredSpeech(alarm),
    startedAtMs: Date.now(),
  };
}

export function isAlarmSessionActive(alarmId: string, activeSessionIds: ReadonlySet<string>) {
  return activeSessionIds.has(alarmId);
}
