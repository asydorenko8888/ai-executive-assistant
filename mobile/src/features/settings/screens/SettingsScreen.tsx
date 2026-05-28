import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/src/components/ui/GlassCard';
import { SectionTitle } from '@/src/components/ui/SectionTitle';
import { VoiceLanguageSelector } from '@/src/components/ui/VoiceLanguageSelector';
import { useVoiceLanguage } from '@/src/features/chat/hooks/useVoiceLanguage';
import { CalendarDebugPanel } from '@/src/features/settings/components/CalendarDebugPanel';
import { useSpeechVoiceSettings } from '@/src/features/settings/hooks/useSpeechVoiceSettings';
import { ScreenContainer } from '@/src/shared/ui';
import { colors, fontSizes, fontWeights, radii, spacing } from '@/src/theme';

export default function SettingsScreen() {
  const { languageCode, activeLanguageLabel, setVoiceLanguage } = useVoiceLanguage();
  const {
    isSupported,
    isLoading,
    voices,
    selectedVoiceURI,
    resolvedVoiceName,
    selectVoice,
    testSelectedVoice,
    formatSpeechVoiceLabel,
  } = useSpeechVoiceSettings();

  return (
    <ScreenContainer scrollable contentContainerStyle={styles.content}>
      <StatusBar style="light" />
      <Text style={styles.title}>Settings</Text>

      <CalendarDebugPanel />

      <GlassCard style={styles.card}>
        <SectionTitle
          title="Voice output"
          subtitle="Browser TTS testing"
          icon="sparkles-outline"
          iconColor={colors.accentBlueSoft}
          iconBackgroundColor={colors.overlaySky}
        />

        {!isSupported ? (
          <Text style={styles.helperText}>
            Voice selection is available on web. iOS uses the system voice configured for your selected language.
          </Text>
        ) : null}

        {isSupported && isLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={colors.accentBlueSoft} />
            <Text style={styles.helperText}>Loading system voices…</Text>
          </View>
        ) : null}

        {isSupported ? (
          <VoiceLanguageSelector
            value={languageCode}
            activeLabel={activeLanguageLabel}
            onChange={(code) => {
              void setVoiceLanguage(code);
            }}
          />
        ) : null}

        {isSupported && !isLoading ? (
          <>
            <Text style={styles.helperText}>
              Voice language: {activeLanguageLabel}
            </Text>
            <Text style={styles.helperText}>
              Active TTS voice: {resolvedVoiceName ?? 'Browser default'}
            </Text>

            <Pressable
              accessibilityRole="button"
              onPress={() => {
                void selectVoice(null);
              }}
              style={({ pressed }) => [
                styles.voiceOption,
                selectedVoiceURI === null && styles.voiceOptionSelected,
                pressed && styles.voiceOptionPressed,
              ]}>
              <Text style={styles.voiceOptionLabel}>Auto (best available English)</Text>
              <Text style={styles.voiceOptionMeta}>Prefers Google US English, Samantha, Daniel, Enhanced</Text>
            </Pressable>

            {voices.map((voice) => {
              const isSelected = selectedVoiceURI === voice.voiceURI;

              return (
                <Pressable
                  key={voice.voiceURI}
                  accessibilityRole="button"
                  onPress={() => {
                    void selectVoice(voice.voiceURI);
                  }}
                  style={({ pressed }) => [
                    styles.voiceOption,
                    isSelected && styles.voiceOptionSelected,
                    pressed && styles.voiceOptionPressed,
                  ]}>
                  <Text style={styles.voiceOptionLabel}>{formatSpeechVoiceLabel(voice)}</Text>
                  {voice.default ? <Text style={styles.voiceOptionMeta}>System default</Text> : null}
                </Pressable>
              );
            })}

            <Pressable
              accessibilityRole="button"
              onPress={testSelectedVoice}
              style={({ pressed }) => [styles.testButton, pressed && styles.testButtonPressed]}>
              <Text style={styles.testButtonLabel}>Test voice</Text>
            </Pressable>
          </>
        ) : null}
      </GlassCard>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.xl,
    paddingBottom: spacing['3xl'],
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSizes['3xl'],
    fontWeight: fontWeights.bold,
  },
  card: {
    gap: spacing.md,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  helperText: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    lineHeight: 20,
  },
  voiceOption: {
    gap: 4,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  voiceOptionSelected: {
    borderColor: colors.borderStrong,
    backgroundColor: colors.overlayBlueSoft,
  },
  voiceOptionPressed: {
    opacity: 0.92,
  },
  voiceOptionLabel: {
    color: colors.textPrimary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
  },
  voiceOptionMeta: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    lineHeight: 18,
  },
  testButton: {
    minHeight: 44,
    marginTop: spacing.sm,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentBlueDeep,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  testButtonPressed: {
    opacity: 0.9,
  },
  testButtonLabel: {
    color: colors.textPrimary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
});
