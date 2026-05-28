import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ChatVoiceLanguageToggle } from '@/src/features/chat/components/ChatVoiceLanguageToggle';
import { ChatVoiceStatus } from '@/src/features/chat/components/ChatVoiceStatus';
import { ChatVoiceButton } from '@/src/features/chat/components/ChatVoiceButton';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { colors, fontSizes, fontWeights, radii, spacing } from '@/src/theme';

type ChatInputBarProps = {
  value: string;
  onChangeText: (value: string) => void;
  onSend: () => void;
  onVoicePress: () => void;
  isSendDisabled: boolean;
  isVoiceProcessing: boolean;
  isSubmitting: boolean;
  voiceStatusLabel?: string | null;
  voiceStatusTone?: 'neutral' | 'error';
  voiceLanguage: VoiceLanguageCode;
  onVoiceLanguageChange: (value: VoiceLanguageCode) => void;
};

export function ChatInputBar({
  value,
  onChangeText,
  onSend,
  onVoicePress,
  isSendDisabled,
  isVoiceProcessing,
  isSubmitting,
  voiceStatusLabel,
  voiceStatusTone = 'neutral',
  voiceLanguage,
  onVoiceLanguageChange,
}: ChatInputBarProps) {
  return (
    <View style={styles.container}>
      <View style={styles.voiceDock}>
        <View style={styles.voiceRow}>
          <ChatVoiceButton
            onPress={onVoicePress}
            isProcessing={isVoiceProcessing}
            disabled={isSubmitting}
          />
          {voiceStatusLabel ? (
            <ChatVoiceStatus
              label={voiceStatusLabel}
              tone={voiceStatusTone}
              isAnimating={isVoiceProcessing}
            />
          ) : null}
        </View>
        <ChatVoiceLanguageToggle
          value={voiceLanguage}
          onChange={onVoiceLanguageChange}
          disabled={isSubmitting || isVoiceProcessing}
        />
      </View>

      <View style={styles.inputShell}>
        <TextInput
          multiline
          maxLength={1200}
          placeholder="Ask for a summary, draft, or decision brief..."
          placeholderTextColor={colors.textSubtle}
          selectionColor={colors.accentBlueSoft}
          style={styles.input}
          editable={!isSubmitting}
          value={value}
          onChangeText={onChangeText}
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send message"
          disabled={isSendDisabled}
          onPress={onSend}
          style={({ pressed }) => [
            styles.sendButton,
            isSendDisabled && styles.sendButtonDisabled,
            pressed && !isSendDisabled && styles.sendButtonPressed,
          ]}>
          {isSubmitting ? (
            <ActivityIndicator size="small" color={colors.textPrimary} />
          ) : (
            <Ionicons
              name="arrow-up"
              size={18}
              color={isSendDisabled ? colors.textSubtle : colors.textPrimary}
            />
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  voiceDock: {
    flexShrink: 0,
    alignItems: 'flex-start',
    gap: spacing.xs,
    paddingBottom: 2,
  },
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  inputShell: {
    flex: 1,
    minWidth: 0,
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    borderRadius: radii.xl,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: {
    flex: 1,
    maxHeight: 112,
    color: colors.textPrimary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.medium,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentBlueDeep,
    marginBottom: 1,
  },
  sendButtonDisabled: {
    backgroundColor: colors.surfaceElevated,
  },
  sendButtonPressed: {
    transform: [{ scale: 0.96 }],
  },
});
