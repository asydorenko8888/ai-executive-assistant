import { buildLocalAlarmTriggeredSpeech } from '@/src/features/local-alarms/localAlarmReplies';
import { buildLocalAlarmVoiceText } from '@/src/features/local-alarms/localAlarmVoiceText';
import type { LocalAlarm } from '@/src/features/local-alarms/types';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';

export const ALARM_VOICE_REPEAT_INTERVAL_MS = 10_000;

export type ActiveAlarmSession = {
  alarmId: string;
  title: string;
  message: string;
  voiceText: string;
  snoozeCount: number;
  languageCode: VoiceLanguageCode;
  startedAtMs: number;
};

export function buildActiveAlarmSession(
  alarm: LocalAlarm,
  languageCode: VoiceLanguageCode,
): ActiveAlarmSession {
  return {
    alarmId: alarm.id,
    title: alarm.title,
    message: buildLocalAlarmTriggeredSpeech(alarm),
    voiceText: buildLocalAlarmVoiceText(alarm, languageCode),
    snoozeCount: alarm.snoozeCount,
    languageCode,
    startedAtMs: Date.now(),
  };
}

export function isAlarmSessionActive(alarmId: string, activeSessionIds: ReadonlySet<string>) {
  return activeSessionIds.has(alarmId);
}
