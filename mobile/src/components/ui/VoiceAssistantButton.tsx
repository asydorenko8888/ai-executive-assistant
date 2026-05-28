import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, withTiming } from 'react-native-reanimated';

import { VoiceLanguageSelector } from '@/src/components/ui/VoiceLanguageSelector';
import {
  mapVoiceStatusToOrbState,
  VoiceOrb,
  VoiceStatusIndicator,
  type VoiceAssistantStatusType,
} from '@/src/components/ui/voice-orb';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { colors, fontSizes, fontWeights, radii, spacing } from '@/src/theme';

export type { VoiceAssistantStatusType } from '@/src/components/ui/voice-orb';

type VoiceAssistantButtonProps = {
  onPress?: () => void;
  onToggleMute?: () => void;
  label: string;
  hint: string;
  statusText?: string;
  transcriptText?: string;
  assistantResponseText?: string;
  statusType?: VoiceAssistantStatusType;
  isSpeechMuted?: boolean;
  isSpeechSupported?: boolean;
  voiceLanguage?: VoiceLanguageCode;
  voiceLanguageLabel?: string;
  onVoiceLanguageChange?: (value: VoiceLanguageCode) => void;
  isVoiceLanguageDisabled?: boolean;
  microphoneStream?: MediaStream | null;
};

function AssistantResponseCard({
  text,
  highlighted,
}: {
  text: string;
  highlighted: boolean;
}) {
  const glow = useAnimatedStyle(() => ({
    borderColor: withTiming(highlighted ? colors.borderStrong : colors.border, { duration: 320 }),
    backgroundColor: withTiming(
      highlighted ? colors.overlayBlueSoft : colors.surfaceElevated,
      { duration: 320 },
    ),
  }));

  return (
    <Animated.View entering={FadeInDown.duration(320).springify()} style={[styles.responseCard, glow]}>
      <Text style={styles.responseLabel}>Assistant</Text>
      <Text style={styles.responseText}>{text}</Text>
    </Animated.View>
  );
}

export function VoiceAssistantButton({
  onPress,
  onToggleMute,
  label,
  hint,
  statusText,
  transcriptText,
  assistantResponseText,
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

      {transcriptText ? (
        <Animated.Text entering={FadeIn.duration(200)} style={styles.transcript}>
          {transcriptText}
        </Animated.Text>
      ) : null}

      {assistantResponseText ? (
        <AssistantResponseCard text={assistantResponseText} highlighted={statusType === 'speaking'} />
      ) : null}
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
  transcript: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: spacing.md,
  },
  responseCard: {
    width: '100%',
    marginTop: spacing.xs,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
    shadowColor: colors.accentBlue,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 16,
    elevation: 4,
  },
  responseLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  responseText: {
    color: colors.textPrimary,
    fontSize: fontSizes.md,
    lineHeight: 24,
  },
});
