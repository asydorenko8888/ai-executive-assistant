import { useEffect, useMemo, useRef } from 'react';

import { FlatList, StyleSheet, View } from 'react-native';

import type { ChatMessage, ChatTypingState } from '@/src/entities/chat/types';
import { ChatMessageBubble } from '@/src/features/chat/components/ChatMessageBubble';
import { ChatTypingIndicator } from '@/src/features/chat/components/ChatTypingIndicator';
import { spacing } from '@/src/theme';

type ChatMessageListProps = {
  messages: ChatMessage[];
  typingState: ChatTypingState;
  isStreaming: boolean;
};

export function ChatMessageList({ messages, typingState, isStreaming }: ChatMessageListProps) {
  const flatListRef = useRef<FlatList<ChatMessage> | null>(null);
  const visibleMessages = useMemo(
    () => messages.filter((message) => message.role === 'user' || message.role === 'assistant'),
    [messages],
  );

  useEffect(() => {
    const timeout = setTimeout(() => {
      flatListRef.current?.scrollToEnd({
        animated: !isStreaming,
      });
    }, 60);

    return () => {
      clearTimeout(timeout);
    };
  }, [isStreaming, typingState.isActive, visibleMessages]);

  return (
    <FlatList
      ref={flatListRef}
      data={visibleMessages}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <ChatMessageBubble message={item} />}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      onContentSizeChange={() => {
        flatListRef.current?.scrollToEnd({
          animated: !isStreaming,
        });
      }}
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
  );
}

const styles = StyleSheet.create({
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
