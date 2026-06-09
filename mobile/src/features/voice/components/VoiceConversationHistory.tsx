import { useCallback, useEffect, useRef } from 'react';

import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import type { ChatMessage } from '@/src/entities/chat/types';
import { ChatMessageBubble } from '@/src/features/chat/components/ChatMessageBubble';
import { isChatAutoScrollAllowed } from '@/src/features/chat/debug/chatEmergencyScrollKill';
import { ChatTypingIndicator } from '@/src/features/chat/components/ChatTypingIndicator';
import { colors, fontSizes, fontWeights, radii, spacing } from '@/src/theme';

type VoiceConversationHistoryProps = {
  messages: ChatMessage[];
  pendingUserTranscript?: string;
  isProcessing?: boolean;
  highlightedMessageId?: string | null;
  onClearConversation?: () => void;
  canClear?: boolean;
};

function PendingUserBubble({ text }: { text: string }) {
  return (
    <Animated.View entering={FadeInDown.duration(220)} style={styles.pendingRow}>
      <View style={[styles.bubble, styles.pendingBubble]}>
        <Text style={styles.pendingLabel}>You</Text>
        <Text style={styles.pendingText}>{text}</Text>
      </View>
    </Animated.View>
  );
}

export function VoiceConversationHistory({
  messages,
  pendingUserTranscript,
  isProcessing = false,
  highlightedMessageId = null,
  onClearConversation,
  canClear = false,
}: VoiceConversationHistoryProps) {
  const scrollRef = useRef<ScrollView | null>(null);
  const scrollToLatest = useCallback(() => {
    if (!isChatAutoScrollAllowed()) {
      return;
    }

    scrollRef.current?.scrollToEnd({ animated: true });
  }, []);

  const messageSignature = `${messages.length}:${messages.at(-1)?.id ?? ''}:${messages.at(-1)?.content.length ?? 0}`;

  useEffect(() => {
    scrollToLatest();
  }, [messageSignature, pendingUserTranscript, isProcessing, highlightedMessageId, scrollToLatest]);

  if (messages.length === 0 && !pendingUserTranscript && !isProcessing) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyTitle}>Your conversation will appear here</Text>
        <Text style={styles.emptyHint}>Tap the orb and speak — each turn stays visible.</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Conversation</Text>
        {canClear && onClearConversation ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear conversation"
            onPress={onClearConversation}
            style={({ pressed }) => [styles.clearButton, pressed && styles.clearButtonPressed]}>
            <Text style={styles.clearButtonText}>Clear</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        nestedScrollEnabled
        scrollEnabled
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={scrollToLatest}>
        {messages.map((item) => (
          <View
            key={item.id}
            style={
              highlightedMessageId === item.id ? styles.highlightedMessageWrap : styles.messageWrap
            }>
            <ChatMessageBubble message={item} />
          </View>
        ))}

        <View style={styles.footer}>
          {pendingUserTranscript ? <PendingUserBubble text={pendingUserTranscript} /> : null}
          {isProcessing ? (
            <View style={styles.typingWrap}>
              <ChatTypingIndicator label="Thinking with you..." />
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    marginTop: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  clearButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  clearButtonPressed: {
    opacity: 0.85,
  },
  clearButtonText: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
  },
  list: {
    maxHeight: 320,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    flexGrow: 1,
  },
  messageWrap: {
    marginBottom: spacing.sm,
  },
  footer: {
    gap: spacing.sm,
  },
  typingWrap: {
    paddingTop: spacing.xs,
  },
  highlightedMessageWrap: {
    marginBottom: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.overlayBlueSoft,
    padding: spacing.xs,
  },
  emptyWrap: {
    width: '100%',
    marginTop: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    gap: spacing.xs,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
  },
  emptyHint: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    lineHeight: 20,
  },
  pendingRow: {
    width: '100%',
    alignItems: 'flex-end',
    marginBottom: spacing.md,
  },
  bubble: {
    maxWidth: '86%',
    borderRadius: radii.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderWidth: 1,
  },
  pendingBubble: {
    backgroundColor: colors.overlayBlueSoft,
    borderColor: colors.borderStrong,
    borderTopRightRadius: spacing.sm,
  },
  pendingLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  pendingText: {
    color: colors.textPrimary,
    fontSize: fontSizes.md,
    lineHeight: 22,
  },
});
