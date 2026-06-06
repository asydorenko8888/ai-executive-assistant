import {
  logAlarmVoiceSelected,
  logLocalAlarmVoiceBlocked,
  logLocalAlarmVoicePlay,
} from '@/src/features/local-alarms/localAlarmMarkers';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguageLocale';
import { playLocalReminderVoice } from '@/src/features/local-reminders/localReminderVoicePlayback';
import { isSpeechSynthesisSupported, speakText } from '@/src/features/chat/services/speechSynthesis';

export function playLocalAlarmVoice(params: {
  alarmId: string;
  title: string;
  voiceText: string;
  snoozeCount: number;
  languageCode: VoiceLanguageCode;
}) {
  logAlarmVoiceSelected({
    id: params.alarmId,
    snoozeCount: params.snoozeCount,
    voiceText: params.voiceText,
  });

  playLocalReminderVoice({
    message: params.voiceText,
    languageCode: params.languageCode,
    isSupported: isSpeechSynthesisSupported,
    speak: speakText,
    onPlay: () => {
      logLocalAlarmVoicePlay({
        id: params.alarmId,
        title: params.title,
      });
    },
    onBlocked: (reason) => {
      logLocalAlarmVoiceBlocked({ reason });
    },
  });
}
