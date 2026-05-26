import { useEffect, useRef } from 'react';

import { FlatList, StyleSheet, View } from 'react-native';

import type { ChatMessage, ChatTypingState } from '@/src/entities/chat/types';
import { ChatMessageBubble } from '@/src/features/chat/components/ChatMessageBubble';
import { ChatTypingIndicator } from '@/src/features/chat/components/ChatTypingIndicator';
import { spacing } from '@/src/theme';

type ChatMessageListProps = {
  messages: ChatMessage[];
  typingState: ChatTypingState;
};

export function ChatMessageList({ messages, typingState }: ChatMessageListProps) {
  const flatListRef = useRef<FlatList<ChatMessage> | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      flatListRef.current?.scrollToEnd({
        animated: true,
      });
    }, 60);

    return () => {
      clearTimeout(timeout);
    };
  }, [messages, typingState.isActive]);

  return (
    <FlatList
      ref={flatListRef}
      data={messages}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <ChatMessageBubble message={item} />}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
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
