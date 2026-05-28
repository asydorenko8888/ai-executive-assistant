import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  VOICE_LANGUAGE_REGISTRY,
  type VoiceLanguageCode,
} from '@/src/features/chat/services/voiceLanguage';
import { colors, fontSizes, fontWeights, radii, spacing } from '@/src/theme';

type VoiceLanguageSelectorProps = {
  value: VoiceLanguageCode;
  activeLabel: string;
  onChange: (value: VoiceLanguageCode) => void;
  disabled?: boolean;
};

export function VoiceLanguageSelector({
  value,
  activeLabel,
  onChange,
  disabled = false,
}: VoiceLanguageSelectorProps) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.activeLabel}>{activeLabel}</Text>
      <View style={[styles.container, disabled && styles.containerDisabled]}>
        {VOICE_LANGUAGE_REGISTRY.map((language) => {
          const isActive = language.code === value;

          return (
            <Pressable
              key={language.code}
              accessibilityRole="button"
              accessibilityLabel={`Voice language ${language.label}`}
              accessibilityState={{ selected: isActive }}
              disabled={disabled}
              onPress={() => onChange(language.code)}
              style={({ pressed }) => [
                styles.option,
                isActive && styles.optionActive,
                pressed && !disabled && styles.optionPressed,
              ]}>
              <Text
                style={[
                  styles.optionLabel,
                  isActive ? styles.optionLabelActive : styles.optionLabelInactive,
                ]}>
                {language.shortLabel}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  activeLabel: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.pill,
    padding: 4,
    backgroundColor: colors.overlaySurface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  containerDisabled: {
    opacity: 0.7,
  },
  option: {
    minWidth: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    paddingVertical: 5,
    paddingHorizontal: spacing.sm,
  },
  optionActive: {
    backgroundColor: colors.accentBlueDeep,
  },
  optionPressed: {
    opacity: 0.92,
  },
  optionLabel: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
  },
  optionLabelActive: {
    color: colors.textPrimary,
  },
  optionLabelInactive: {
    color: colors.textMuted,
  },
});
