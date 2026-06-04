import { useEffect, useRef } from 'react';

import { Animated, StyleSheet, Text, View } from 'react-native';

import type { ChatMessage } from '@/src/entities/chat/types';
import type { ChatMessageDebugMeta } from '@/src/features/chat/debug/conversationDebugTypes';
import { ChatMessageDebugDetails } from '@/src/features/chat/components/ChatMessageDebugDetails';
import { colors, fontSizes, fontWeights, radii, spacing } from '@/src/theme';

type ChatMessageBubbleProps = {
  message: ChatMessage;
  debugMeta?: ChatMessageDebugMeta;
  showDebugInspector?: boolean;
};

export function ChatMessageBubble({
  message,
  debugMeta,
  showDebugInspector = false,
}: ChatMessageBubbleProps) {
  const isUserMessage = message.role === 'user';
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animatedValue, {
      toValue: 1,
      duration: 240,
      useNativeDriver: true,
    }).start();
  }, [animatedValue]);

  return (
    <Animated.View
      style={[
        styles.row,
        isUserMessage ? styles.userRow : styles.assistantRow,
        {
          opacity: animatedValue,
          transform: [
            {
              translateY: animatedValue.interpolate({
                inputRange: [0, 1],
                outputRange: [10, 0],
              }),
            },
          ],
        },
      ]}>
      <View style={[styles.bubble, isUserMessage ? styles.userBubble : styles.assistantBubble]}>
        <Text style={[styles.content, isUserMessage ? styles.userContent : styles.assistantContent]}>
          {message.content}
        </Text>

        <View style={styles.metaRow}>
          <Text style={[styles.time, isUserMessage ? styles.userTime : styles.assistantTime]}>
            {message.createdAt}
          </Text>
          {isUserMessage ? <Text style={styles.status}>{message.status}</Text> : null}
        </View>

        {showDebugInspector && debugMeta ? <ChatMessageDebugDetails debug={debugMeta} /> : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    width: '100%',
    marginBottom: spacing.md,
  },
  assistantRow: {
    alignItems: 'flex-start',
  },
  userRow: {
    alignItems: 'flex-end',
  },
  bubble: {
    maxWidth: '86%',
    borderRadius: radii.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderWidth: 1,
  },
  assistantBubble: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderTopLeftRadius: spacing.sm,
  },
  userBubble: {
    backgroundColor: colors.accentBlueDeep,
    borderColor: colors.borderStrong,
    borderTopRightRadius: spacing.sm,
  },
  content: {
    fontSize: fontSizes.lg,
    lineHeight: 22,
  },
  assistantContent: {
    color: colors.textPrimary,
  },
  userContent: {
    color: colors.textPrimary,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  time: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
  },
  assistantTime: {
    color: colors.textSubtle,
  },
  userTime: {
    color: colors.accentSkyBadge,
  },
  status: {
    color: colors.accentSkyBadge,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
    textTransform: 'capitalize',
  },
});
