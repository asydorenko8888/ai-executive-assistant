import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { VoiceLanguageSelector } from '@/src/components/ui/VoiceLanguageSelector';
import {
  mapVoiceStatusToOrbState,
  VoiceOrb,
  VoiceStatusIndicator,
  type VoiceAssistantStatusType,
} from '@/src/components/ui/voice-orb';
import type { ChatMessage } from '@/src/entities/chat/types';
import { VoiceConversationHistory } from '@/src/features/voice/components/VoiceConversationHistory';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { colors, fontSizes, fontWeights, radii, spacing } from '@/src/theme';

export type { VoiceAssistantStatusType } from '@/src/components/ui/voice-orb';

type VoiceAssistantButtonProps = {
  onPress?: () => void;
  onToggleMute?: () => void;
  onClearConversation?: () => void;
  label: string;
  hint: string;
  statusText?: string;
  conversationMessages?: ChatMessage[];
  pendingUserTranscript?: string;
  highlightedMessageId?: string | null;
  isProcessing?: boolean;
  canClearConversation?: boolean;
  statusType?: VoiceAssistantStatusType;
  isSpeechMuted?: boolean;
  isSpeechSupported?: boolean;
  voiceLanguage?: VoiceLanguageCode;
  voiceLanguageLabel?: string;
  onVoiceLanguageChange?: (value: VoiceLanguageCode) => void;
  isVoiceLanguageDisabled?: boolean;
  microphoneStream?: MediaStream | null;
};

export function VoiceAssistantButton({
  onPress,
  onToggleMute,
  onClearConversation,
  label,
  hint,
  statusText,
  conversationMessages = [],
  pendingUserTranscript,
  highlightedMessageId = null,
  isProcessing = false,
  canClearConversation = false,
  statusType = 'idle',
  isSpeechMuted = false,
  isSpeechSupported = true,
  voiceLanguage,
  voiceLanguageLabel,
  onVoiceLanguageChange,
  isVoiceLanguageDisabled = false,
  microphoneStream = null,
}: VoiceAssistantButtonProps) {
  const orbState = mapVoiceStatusToOrbState(statusType);
  const displayStatus = statusText ?? 'Tap to speak';
  const showInterruptHint = statusType === 'speaking';

  return (
    <View style={styles.section}>
      <VoiceOrb state={orbState} onPress={onPress} microphoneStream={microphoneStream} />

      <Text style={styles.label}>{label}</Text>

      {voiceLanguage && onVoiceLanguageChange && voiceLanguageLabel ? (
        <VoiceLanguageSelector
          value={voiceLanguage}
          activeLabel={voiceLanguageLabel}
          onChange={onVoiceLanguageChange}
          disabled={isVoiceLanguageDisabled}
        />
      ) : null}

      <Text style={styles.hint}>{hint}</Text>

      <VoiceStatusIndicator
        status={statusType}
        label={displayStatus}
        showInterruptHint={showInterruptHint}
      />

      {isSpeechSupported ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isSpeechMuted ? 'Unmute assistant speech' : 'Mute assistant speech'}
          onPress={onToggleMute}
          style={({ pressed }) => [styles.muteButton, pressed && styles.muteButtonPressed]}>
          <Ionicons
            name={isSpeechMuted ? 'volume-mute' : 'volume-high'}
            size={18}
            color={isSpeechMuted ? colors.textMuted : colors.textPrimary}
          />
          <Text style={[styles.muteLabel, isSpeechMuted && styles.muteLabelMuted]}>
            {isSpeechMuted ? 'Muted' : 'Sound on'}
          </Text>
        </Pressable>
      ) : null}

      <VoiceConversationHistory
        messages={conversationMessages}
        pendingUserTranscript={pendingUserTranscript}
        isProcessing={isProcessing}
        highlightedMessageId={highlightedMessageId}
        onClearConversation={onClearConversation}
        canClear={canClearConversation}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  label: {
    color: colors.textPrimary,
    fontSize: fontSizes['2xl'],
    fontWeight: fontWeights.bold,
    marginTop: spacing.sm,
  },
  hint: {
    color: colors.textMuted,
    fontSize: fontSizes.md,
    textAlign: 'center',
  },
  muteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  muteButtonPressed: {
    opacity: 0.9,
  },
  muteLabel: {
    color: colors.textPrimary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
  muteLabelMuted: {
    color: colors.textMuted,
  },
});
