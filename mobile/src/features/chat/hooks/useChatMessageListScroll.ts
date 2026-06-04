import { useCallback, useEffect, useRef, useState } from 'react';

import type { FlatList, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

import type { ChatMessage } from '@/src/entities/chat/types';
import { isChatAutoScrollAllowed } from '@/src/features/chat/debug/chatEmergencyScrollKill';
import { isChatNearBottom } from '@/src/features/chat/debug/chatScrollLogic';

type UseChatMessageListScrollParams = {
  scrollTriggerKey: string;
  isStreaming: boolean;
  isTypingActive: boolean;
  debugModeEnabled: boolean;
};

export function useChatMessageListScroll({
  scrollTriggerKey,
  isStreaming,
  isTypingActive,
  debugModeEnabled,
}: UseChatMessageListScrollParams) {
  const flatListRef = useRef<FlatList<ChatMessage> | null>(null);
  const scrollOffsetRef = useRef(0);
  const contentHeightRef = useRef(0);
  const layoutHeightRef = useRef(0);
  const isNearBottomRef = useRef(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

  const readNearBottom = useCallback(() => {
    return isChatNearBottom({
      scrollHeight: contentHeightRef.current,
      scrollTop: scrollOffsetRef.current,
      clientHeight: layoutHeightRef.current,
    });
  }, []);

  const updateJumpButtonVisibility = useCallback(() => {
    const nearBottom = readNearBottom();
    isNearBottomRef.current = nearBottom;
    setShowJumpToLatest(!nearBottom);
  }, [readNearBottom]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      scrollOffsetRef.current = contentOffset.y;
      contentHeightRef.current = contentSize.height;
      layoutHeightRef.current = layoutMeasurement.height;
      updateJumpButtonVisibility();
    },
    [updateJumpButtonVisibility],
  );

  const shouldAutoScroll = useCallback(() => {
    if (!isChatAutoScrollAllowed()) {
      return false;
    }

    if (debugModeEnabled) {
      return false;
    }

    return isNearBottomRef.current;
  }, [debugModeEnabled]);

  const scrollToLatest = useCallback((animated = true) => {
    flatListRef.current?.scrollToEnd({ animated });
    isNearBottomRef.current = true;
    setShowJumpToLatest(false);
  }, []);

  const scrollToFirst = useCallback((animated = true) => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated });
    scrollOffsetRef.current = 0;
    isNearBottomRef.current = false;
    setShowJumpToLatest(true);
  }, []);

  const applyScrollAfterContentChange = useCallback(() => {
    if (!isChatAutoScrollAllowed()) {
      return;
    }

    if (shouldAutoScroll()) {
      scrollToLatest(!isStreaming);
      return;
    }

    flatListRef.current?.scrollToOffset({
      offset: scrollOffsetRef.current,
      animated: false,
    });
    updateJumpButtonVisibility();
  }, [isStreaming, scrollToLatest, shouldAutoScroll, updateJumpButtonVisibility]);

  useEffect(() => {
    if (!isChatAutoScrollAllowed()) {
      return;
    }

    const timeout = setTimeout(() => {
      applyScrollAfterContentChange();
    }, 60);

    return () => {
      clearTimeout(timeout);
    };
  }, [applyScrollAfterContentChange, isStreaming, isTypingActive, scrollTriggerKey]);

  const handleContentSizeChange = useCallback(() => {
    if (!isChatAutoScrollAllowed()) {
      return;
    }

    applyScrollAfterContentChange();
  }, [applyScrollAfterContentChange]);

  return {
    flatListRef,
    handleScroll,
    handleContentSizeChange,
    showJumpToLatest,
    scrollToLatest,
    scrollToFirst,
  };
}
