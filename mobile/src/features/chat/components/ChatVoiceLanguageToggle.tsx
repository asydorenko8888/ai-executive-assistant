import { VoiceLanguageSelector } from '@/src/components/ui/VoiceLanguageSelector';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { getVoiceLanguageDefinition } from '@/src/features/chat/services/voiceLanguage';

type ChatVoiceLanguageToggleProps = {
  value: VoiceLanguageCode;
  onChange: (value: VoiceLanguageCode) => void;
  disabled?: boolean;
};

export function ChatVoiceLanguageToggle({ value, onChange, disabled = false }: ChatVoiceLanguageToggleProps) {
  return (
    <VoiceLanguageSelector
      value={value}
      activeLabel={getVoiceLanguageDefinition(value).label}
      onChange={onChange}
      disabled={disabled}
    />
  );
}
