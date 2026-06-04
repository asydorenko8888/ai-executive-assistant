import { useEffect, useMemo } from 'react';

import { FlatList, StyleSheet, View } from 'react-native';

import type { ChatMessage, ChatTypingState } from '@/src/entities/chat/types';
import {
  ChatEmergencyGoTopButton,
  emergencyScrollPageToTop,
} from '@/src/features/chat/components/ChatEmergencyGoTopButton';
import { ChatJumpToLatestButton } from '@/src/features/chat/components/ChatJumpToLatestButton';
import { FORCE_DISABLE_AUTOSCROLL } from '@/src/features/chat/debug/chatEmergencyScrollKill';
import { ChatMessageBubble } from '@/src/features/chat/components/ChatMessageBubble';
import { ChatTypingIndicator } from '@/src/features/chat/components/ChatTypingIndicator';
import { useChatMessageListScroll } from '@/src/features/chat/hooks/useChatMessageListScroll';
import { useConversationDebugMode } from '@/src/features/chat/hooks/useConversationDebugMode';
import { useConversationMessageDebugStore } from '@/src/features/chat/store/conversationMessageDebugStore';
import { spacing } from '@/src/theme';

/** TEMPORARY: set false in chatEmergencyScrollKill.ts to re-enable auto-scroll. */
const FORCE_DISABLE_AUTOSCROLL_LOCAL = FORCE_DISABLE_AUTOSCROLL;

type ChatMessageListProps = {
  messages: ChatMessage[];
  typingState: ChatTypingState;
  isStreaming: boolean;
  onRegisterScrollActions?: (actions: {
    scrollToLatest: (animated?: boolean) => void;
    scrollToFirst: (animated?: boolean) => void;
  }) => void;
};

export function ChatMessageList({
  messages,
  typingState,
  isStreaming,
  onRegisterScrollActions,
}: ChatMessageListProps) {
  const { enabled: debugModeEnabled } = useConversationDebugMode();
  const debugByMessageId = useConversationMessageDebugStore((state) => state.byMessageId);
  const visibleMessages = useMemo(
    () => messages.filter((message) => message.role === 'user' || message.role === 'assistant'),
    [messages],
  );

  const scrollTriggerKey = useMemo(() => {
    const last = visibleMessages[visibleMessages.length - 1];
    return `${visibleMessages.length}:${last?.id ?? 'none'}:${last?.content.length ?? 0}:${typingState.isActive}:${isStreaming}`;
  }, [isStreaming, typingState.isActive, visibleMessages]);

  const {
    flatListRef,
    handleScroll,
    handleContentSizeChange,
    showJumpToLatest,
    scrollToLatest,
    scrollToFirst,
  } = useChatMessageListScroll({
    scrollTriggerKey,
    isStreaming,
    isTypingActive: typingState.isActive,
    debugModeEnabled,
  });

  useEffect(() => {
    onRegisterScrollActions?.({ scrollToLatest, scrollToFirst });
  }, [onRegisterScrollActions, scrollToFirst, scrollToLatest]);

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={visibleMessages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ChatMessageBubble
            message={item}
            debugMeta={debugByMessageId[item.id]}
            showDebugInspector={debugModeEnabled}
          />
        )}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator
        scrollEventThrottle={16}
        onScroll={handleScroll}
        onContentSizeChange={handleContentSizeChange}
        ListFooterComponent={
          typingState.isActive ? (
            <View style={styles.typingWrap}>
              <ChatTypingIndicator label={typingState.label} />
            </View>
          ) : (
            <View style={styles.footerSpacer} />
          )
        }
      />

      {FORCE_DISABLE_AUTOSCROLL_LOCAL ? (
        <ChatEmergencyGoTopButton
          onPress={() => {
            emergencyScrollPageToTop();
            scrollToFirst(false);
          }}
        />
      ) : (
        <ChatJumpToLatestButton
          visible={showJumpToLatest}
          onPress={() => {
            scrollToLatest(true);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  typingWrap: {
    paddingTop: spacing.sm,
  },
  footerSpacer: {
    height: spacing.sm,
  },
});
