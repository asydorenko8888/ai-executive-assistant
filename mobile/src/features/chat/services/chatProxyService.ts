import { Platform } from 'react-native';

import type { ChatMessage } from '@/src/entities/chat/types';
import {
  fetchWithAbort,
  isAbortError,
  logAssistantConversation,
} from '@/src/features/chat/services/assistantConversationLifecycle';
import { ApiError, createApiErrorFromResponse, toApiError } from '@/src/shared/api';
import { getAppApiKeyHeaders } from '@/src/shared/api/authHeaders';
import { env } from '@/src/shared/config';

type BackendChatRequest = {
  stream?: boolean;
  messages: {
    role: 'system' | 'assistant' | 'user';
    content: string;
  }[];
};

type BackendChatResponse = {
  content?: string | null;
};

type BackendChatStreamChunk = {
  choices?: {
    delta?: {
      content?: string | null;
    };
    finish_reason?: string | null;
  }[];
  error?: {
    message?: string;
  };
};

type StreamExecutiveChatResponseOptions = {
  messages: ChatMessage[];
  systemMessages?: ChatMessage[];
  onToken: (token: string) => void;
  signal?: AbortSignal;
  requestId?: string;
};

type SendExecutiveChatOptions = {
  signal?: AbortSignal;
  requestId?: string;
};

function getRuntimeApiBaseUrl() {
  const configuredBaseUrl = env.apiBaseUrl;

  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return configuredBaseUrl;
  }

  try {
    const currentHostname = window.location.hostname;
    const url = new URL(configuredBaseUrl);

    if (
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1') &&
      currentHostname
    ) {
      url.hostname = currentHostname;
    }

    return url.toString().replace(/\/$/, '');
  } catch {
    return configuredBaseUrl;
  }
}

function mapMessagesForBackend(messages: ChatMessage[]) {
  return messages
    .filter((message) => message.role === 'assistant' || message.role === 'user' || message.role === 'system')
    .map((message) => ({
      role:
        message.role === 'assistant' || message.role === 'system'
          ? message.role
          : ('user' as const),
      content: message.content,
    }));
}

function createBackendRequestPayload(messages: ChatMessage[], systemMessages: ChatMessage[] = []): BackendChatRequest {
  return {
    messages: mapMessagesForBackend([...systemMessages, ...messages]),
  };
}

function parseSseEvent(rawEvent: string) {
  const dataLines = rawEvent
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim());

  if (dataLines.length === 0) {
    return null;
  }

  const payload = dataLines.join('\n');

  if (payload === '[DONE]') {
    return '[DONE]';
  }

  return payload;
}

async function readStreamingResponse(
  response: Response,
  onToken: (token: string) => void,
  signal?: AbortSignal,
) {
  const responseBody = response.body;

  if (!responseBody || typeof responseBody.getReader !== 'function') {
    logAssistantConversation('[AssistantStream]', 'ReadableStream not available — non-stream fallback');
    return null;
  }

  const reader = responseBody.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let aggregatedContent = '';

  while (true) {
    if (signal?.aborted) {
      logAssistantConversation('[AssistantStream]', 'Stream read aborted');
      throw Object.assign(new Error('The assistant stream was aborted.'), { name: 'AbortError' });
    }

    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, {
      stream: true,
    });

    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';

    for (const event of events) {
      const parsedEvent = parseSseEvent(event);

      if (!parsedEvent) {
        continue;
      }

      if (parsedEvent === '[DONE]') {
        logAssistantConversation('[AssistantStream]', 'Received [DONE]');
        return aggregatedContent.trim();
      }

      const payload = JSON.parse(parsedEvent) as BackendChatStreamChunk;

      if (payload.error?.message) {
        throw new ApiError({
          message: payload.error.message,
          status: 502,
          code: 'CHAT_PROXY_STREAM_FAILED',
          retryable: true,
        });
      }

      const token = payload.choices?.[0]?.delta?.content ?? '';

      if (!token) {
        continue;
      }

      aggregatedContent += token;
      onToken(token);
    }
  }

  if (buffer.trim()) {
    const parsedEvent = parseSseEvent(buffer);

    if (parsedEvent && parsedEvent !== '[DONE]') {
      const payload = JSON.parse(parsedEvent) as BackendChatStreamChunk;
      const token = payload.choices?.[0]?.delta?.content ?? '';

      if (token) {
        aggregatedContent += token;
        onToken(token);
      }
    }
  }

  logAssistantConversation('[AssistantStream]', 'Stream body ended', {
    length: aggregatedContent.length,
  });

  return aggregatedContent.trim();
}

async function parseErrorPayload(response: Response) {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    return response.json();
  }

  return response.text();
}

export async function sendExecutiveChatMessage(
  messages: ChatMessage[],
  systemMessages: ChatMessage[] = [],
  options: SendExecutiveChatOptions = {},
) {
  const requestUrl = `${getRuntimeApiBaseUrl()}/chat`;
  const requestBody = {
    ...createBackendRequestPayload(messages, systemMessages),
    stream: false,
  };

  logAssistantConversation('[AssistantStream]', 'Non-stream request started', {
    requestId: options.requestId,
  });

  try {
    const response = await fetchWithAbort(requestUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...getAppApiKeyHeaders(),
      },
      body: JSON.stringify(requestBody),
      signal: options.signal,
    });

    if (!response.ok) {
      const errorPayload = await parseErrorPayload(response);

      console.log('[Executive AI chat] Response', {
        status: response.status,
        body: errorPayload,
      });

      throw createApiErrorFromResponse(response.status, errorPayload);
    }

    const payload = (await response.json()) as BackendChatResponse;
    console.log('[Executive AI chat] Response', {
      status: response.status,
      body: payload,
    });
    const assistantReply = payload.content?.trim();

    if (!assistantReply) {
      throw new ApiError({
        message: 'Executive AI backend returned an empty response.',
        status: 502,
        code: 'CHAT_PROXY_EMPTY_RESPONSE',
        retryable: true,
      });
    }

    logAssistantConversation('[AssistantFinalize]', 'Non-stream response ready', {
      requestId: options.requestId,
      length: assistantReply.length,
    });

    return assistantReply;
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    console.error('[Executive AI chat] Request error', error);
    throw toApiError(error);
  }
}

export async function streamExecutiveChatMessage({
  messages,
  systemMessages = [],
  onToken,
  signal,
  requestId,
}: StreamExecutiveChatResponseOptions) {
  const requestUrl = `${getRuntimeApiBaseUrl()}/chat`;
  const requestBody = {
    ...createBackendRequestPayload(messages, systemMessages),
    stream: true,
  };

  let hasReceivedToken = false;

  logAssistantConversation('[AssistantStream]', 'Stream request started', { requestId });

  try {
    const response = await fetchWithAbort(requestUrl, {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
        ...getAppApiKeyHeaders(),
      },
      body: JSON.stringify(requestBody),
      signal,
    });

    if (!response.ok) {
      const errorPayload = await parseErrorPayload(response);

      console.log('[Executive AI chat] Response', {
        status: response.status,
        body: errorPayload,
      });

      throw createApiErrorFromResponse(response.status, errorPayload);
    }

    const streamedContent = await readStreamingResponse(
      response,
      (token) => {
        hasReceivedToken = true;
        onToken(token);
      },
      signal,
    );

    console.log('[Executive AI chat] Response', {
      status: response.status,
      body: streamedContent,
    });

    if (streamedContent) {
      logAssistantConversation('[AssistantFinalize]', 'Stream completed with content', {
        requestId,
        length: streamedContent.length,
      });
      return streamedContent;
    }

    if (hasReceivedToken) {
      logAssistantConversation('[AssistantFinalize]', 'Stream ended without trailing payload — using partial', {
        requestId,
      });
      return '';
    }

    if (signal?.aborted) {
      throw Object.assign(new Error('The assistant stream was aborted before completion.'), {
        name: 'AbortError',
      });
    }

    logAssistantConversation('[AssistantStream]', 'Empty stream — falling back to non-stream');
    return sendExecutiveChatMessage(messages, systemMessages, { signal, requestId });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    if (!hasReceivedToken) {
      logAssistantConversation('[AssistantStream]', 'Stream failed before tokens — non-stream fallback', {
        requestId,
      });
      return sendExecutiveChatMessage(messages, systemMessages, { signal, requestId });
    }

    console.error('[Executive AI chat] Request error', error);
    throw toApiError(error);
  }
}
