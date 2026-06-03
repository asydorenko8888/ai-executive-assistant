import type { AssistantRequestTerminalState } from '@/src/features/chat/services/assistantConversationLifecycle';
import {
  ASSISTANT_INACTIVITY_TIMEOUT_MS,
  ASSISTANT_MAX_REQUEST_MS,
  buildAssistantRecoveryMessage,
  createAssistantRequestAbortController,
  logAssistantConversation,
} from '@/src/features/chat/services/assistantConversationLifecycle';
import { useExecutiveConversationStore } from '@/src/features/chat/store/executiveConversationStore';

export type ActiveAssistantRequest = {
  requestId: string;
  assistantMessageId: string;
  terminalState: AssistantRequestTerminalState | 'in_progress';
  finalized: boolean;
  abortController: ReturnType<typeof createAssistantRequestAbortController>;
};

function createRequestId() {
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getAssistantPartialContent(assistantMessageId: string): string {
  const message = useExecutiveConversationStore
    .getState()
    .messages.find((entry) => entry.id === assistantMessageId);

  return message?.content?.trim() ?? '';
}

export function createAssistantRequestCoordinator() {
  let activeRequest: ActiveAssistantRequest | null = null;

  const getActive = () => activeRequest;

  const isCurrentRequest = (requestId: string) => activeRequest?.requestId === requestId;

  const begin = (
    assistantMessageId: string,
    onInactivityTimeout: (request: ActiveAssistantRequest) => void,
    timing?: { inactivityMs?: number; maxMs?: number },
  ) => {
    if (activeRequest && !activeRequest.finalized) {
      logAssistantConversation('[Conversation]', 'Interrupting in-flight assistant request', {
        previousRequestId: activeRequest.requestId,
      });
      activeRequest.terminalState = 'interrupted';
      activeRequest.finalized = true;
      activeRequest.abortController.abort();
      activeRequest.abortController.dispose();
    }

    const requestId = createRequestId();
    const abortController = createAssistantRequestAbortController({
      inactivityMs: timing?.inactivityMs ?? ASSISTANT_INACTIVITY_TIMEOUT_MS,
      maxMs: timing?.maxMs ?? ASSISTANT_MAX_REQUEST_MS,
      onInactivity: () => {
        if (activeRequest?.requestId === requestId && !activeRequest.finalized) {
          onInactivityTimeout(activeRequest);
        }
      },
    });

    activeRequest = {
      requestId,
      assistantMessageId,
      terminalState: 'in_progress',
      finalized: false,
      abortController,
    };

    logAssistantConversation('[Conversation]', 'Assistant request started', {
      requestId,
      assistantMessageId,
    });

    return activeRequest;
  };

  const touch = (requestId: string) => {
    if (activeRequest?.requestId === requestId) {
      activeRequest.abortController.touch();
    }
  };

  const markTerminal = (
    requestId: string,
    terminalState: AssistantRequestTerminalState,
  ): ActiveAssistantRequest | null => {
    if (!activeRequest || activeRequest.requestId !== requestId) {
      return null;
    }

    activeRequest.terminalState = terminalState;
    return activeRequest;
  };

  const finalizeRequest = (requestId: string) => {
    if (!activeRequest || activeRequest.requestId !== requestId) {
      return;
    }

    activeRequest.finalized = true;
    activeRequest.abortController.dispose();
    logAssistantConversation('[Conversation]', 'Assistant request finalized', {
      requestId,
      terminalState: activeRequest.terminalState,
    });
  };

  const clear = (requestId: string) => {
    if (activeRequest?.requestId === requestId) {
      activeRequest.abortController.dispose();
      activeRequest = null;
    }
  };

  const buildRecoveryForRequest = (
    assistantMessageId: string,
    reason: 'timeout' | 'failed' | 'empty',
  ) => {
    return buildAssistantRecoveryMessage(getAssistantPartialContent(assistantMessageId), reason);
  };

  return {
    begin,
    touch,
    markTerminal,
    finalizeRequest,
    clear,
    getActive,
    isCurrentRequest,
    buildRecoveryForRequest,
  };
}
