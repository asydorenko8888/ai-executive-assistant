import { useEffect } from 'react';
import { Platform } from 'react-native';

type UseConversationKeyboardShortcutsParams = {
  enabled: boolean;
  onToggleDebugMode: () => void;
  onJumpToLatest: () => void;
  onJumpToFirst: () => void;
};

function isTypingTarget(target: EventTarget | null) {
  if (!target || typeof target !== 'object') {
    return false;
  }

  const element = target as { tagName?: string; isContentEditable?: boolean };
  const tag = element.tagName?.toLowerCase();

  return tag === 'input' || tag === 'textarea' || element.isContentEditable === true;
}

export function useConversationKeyboardShortcuts({
  enabled,
  onToggleDebugMode,
  onJumpToLatest,
  onJumpToFirst,
}: UseConversationKeyboardShortcutsParams) {
  useEffect(() => {
    if (!enabled || Platform.OS !== 'web' || typeof window === 'undefined') {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();

      if (event.ctrlKey && event.shiftKey && key === 'd') {
        event.preventDefault();
        onToggleDebugMode();
        return;
      }

      if (event.ctrlKey && key === 'end') {
        event.preventDefault();
        onJumpToLatest();
        return;
      }

      if (event.ctrlKey && key === 'home') {
        event.preventDefault();
        onJumpToFirst();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, onJumpToFirst, onJumpToLatest, onToggleDebugMode]);
}
