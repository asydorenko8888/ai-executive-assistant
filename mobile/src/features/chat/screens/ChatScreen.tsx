import { useCallback, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { GlassCard } from '@/src/components/ui/GlassCard';
import { ChatHeader } from '@/src/features/chat/components/ChatHeader';
import { ChatCalendarAuthBanner } from '@/src/features/chat/components/ChatCalendarAuthBanner';
import { ChatInputBar } from '@/src/features/chat/components/ChatInputBar';
import { ChatMessageList } from '@/src/features/chat/components/ChatMessageList';
import { FORCE_DISABLE_AUTOSCROLL } from '@/src/features/chat/debug/chatEmergencyScrollKill';
import { useConversationDebugMode } from '@/src/features/chat/hooks/useConversationDebugMode';
import { useConversationKeyboardShortcuts } from '@/src/features/chat/hooks/useConversationKeyboardShortcuts';
import { useExecutiveChat } from '@/src/features/chat/hooks/useExecutiveChat';
import { ErrorState, ScreenContainer } from '@/src/shared/ui';
import { colors, fontSizes, fontWeights, spacing } from '@/src/theme';

type ChatScrollActions = {
  scrollToLatest: (animated?: boolean) => void;
  scrollToFirst: (animated?: boolean) => void;
};

export default function ChatScreen() {
  const scrollActionsRef = useRef<ChatScrollActions | null>(null);
  const { enabled: debugModeEnabled, toggle: toggleDebugMode } = useConversationDebugMode();
  const {
    thread,
    messages,
    draft,
    setDraft,
    sendDraft,
    sendVoicePrompt,
    typingState,
    isVoiceProcessing,
    lastUserMessage,
    errorMessage,
    clearError,
    resetChatHistory,
    isAwaitingAssistant,
    isStreamingAssistant,
    hasDraft,
    voiceStatusLabel,
    voiceStatusTone,
    voiceLanguage,
    setVoiceLanguage: setVoiceLanguageCode,
    calendarOperationalUx,
    calendarOperationalLabel,
    isCalendarOAuthInFlight,
    connectGoogleCalendarForPendingAction,
  } = useExecutiveChat();

  const registerScrollActions = useCallback((actions: ChatScrollActions) => {
    scrollActionsRef.current = actions;
  }, []);

  useConversationKeyboardShortcuts({
    enabled: true,
    onToggleDebugMode: () => {
      void toggleDebugMode();
    },
    onJumpToLatest: () => {
      scrollActionsRef.current?.scrollToLatest(true);
    },
    onJumpToFirst: () => {
      scrollActionsRef.current?.scrollToFirst(true);
    },
  });

  const handleHistoryResetRequest = () => {
    Alert.alert(
      'Reset chat history?',
      'This will clear the locally saved conversation on this device and start the executive chat from the default state.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            void resetChatHistory();
          },
        },
      ],
    );
  };

  return (
    <ScreenContainer contentContainerStyle={styles.screen}>
      <StatusBar style="light" />

      <KeyboardAvoidingView
        style={styles.keyboardLayer}
        behavior={Platform.select({ ios: 'padding', default: undefined })}>
        <ChatHeader thread={thread} onHistoryResetRequest={handleHistoryResetRequest} />

        {FORCE_DISABLE_AUTOSCROLL || debugModeEnabled ? (
          <View style={styles.debugBanner}>
            <Text style={styles.debugBannerText}>
              {FORCE_DISABLE_AUTOSCROLL
                ? 'EMERGENCY: auto-scroll disabled — use Go Top (bottom-left)'
                : 'Debug conversation mode — auto-scroll off'}
            </Text>
          </View>
        ) : null}

        <View style={styles.heroRow}>
          <View style={styles.heroCopy}>
            <Text style={styles.kicker}>Executive Chat</Text>
            <Text style={styles.title}>Strategic conversation, voice-first when needed.</Text>
          </View>

          <View style={styles.heroPill}>
            <Text style={styles.heroPillText}>
              {lastUserMessage ? 'Context aware' : 'Ready to assist'}
            </Text>
          </View>
        </View>

        <View style={styles.listWrap}>
          <ChatMessageList
            messages={messages}
            typingState={typingState}
            isStreaming={isStreamingAssistant}
            onRegisterScrollActions={registerScrollActions}
          />
        </View>

        <ChatCalendarAuthBanner
          phase={calendarOperationalUx}
          statusLabel={calendarOperationalLabel}
          isConnecting={isCalendarOAuthInFlight}
          onConnectPress={() => {
            void connectGoogleCalendarForPendingAction();
          }}
        />

        {errorMessage ? (
          <ErrorState
            title="Executive AI unavailable"
            description={errorMessage}
            actionLabel="Dismiss"
            onActionPress={clearError}
          />
        ) : null}

        <GlassCard style={styles.composerCard} contentStyle={styles.composerContent}>
          <Text style={styles.composerHint}>
            Ask for summaries, stakeholder notes, or a decision-ready briefing.
          </Text>

          <ChatInputBar
            value={draft}
            onChangeText={setDraft}
            onSend={sendDraft}
            onVoicePress={sendVoicePrompt}
            isSendDisabled={!hasDraft || isVoiceProcessing}
            isVoiceProcessing={isVoiceProcessing}
            isSubmitting={isAwaitingAssistant}
            voiceStatusLabel={voiceStatusLabel}
            voiceStatusTone={voiceStatusTone}
            voiceLanguage={voiceLanguage}
            onVoiceLanguageChange={(code) => {
              void setVoiceLanguageCode(code);
            }}
          />
        </GlassCard>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    gap: spacing.lg,
  },
  keyboardLayer: {
    flex: 1,
    gap: spacing.lg,
  },
  debugBanner: {
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.overlayPurpleSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  debugBannerText: {
    color: colors.accentPurple,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  heroCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  kicker: {
    color: colors.accentBlueSoft,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSizes['2xl'],
    fontWeight: fontWeights.bold,
    lineHeight: 30,
  },
  heroPill: {
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.overlayPurpleSoft,
  },
  heroPillText: {
    color: colors.accentPurple,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
  },
  listWrap: {
    flex: 1,
  },
  composerCard: {
    gap: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  composerContent: {
    gap: spacing.md,
  },
  composerHint: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
  },
});
