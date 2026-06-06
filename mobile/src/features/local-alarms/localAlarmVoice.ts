import {
  logLocalAlarmVoiceBlocked,
  logLocalAlarmVoicePlay,
} from '@/src/features/local-alarms/localAlarmMarkers';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguageLocale';
import { playLocalReminderVoice } from '@/src/features/local-reminders/localReminderVoicePlayback';
import { isSpeechSynthesisSupported, speakText } from '@/src/features/chat/services/speechSynthesis';

export function playLocalAlarmVoice(params: {
  alarmId: string;
  title: string;
  message: string;
  languageCode: VoiceLanguageCode;
}) {
  playLocalReminderVoice({
    message: params.message,
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
