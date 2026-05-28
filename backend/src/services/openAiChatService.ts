import OpenAI from 'openai';
import type { ChatCompletionCreateParamsNonStreaming, ChatCompletionCreateParamsStreaming } from 'openai/resources/chat/completions';

import { backendEnv } from '../config/env.js';
import { executiveSystemPrompt } from './executivePrompt.js';
import { normalizeAssistantReply } from './responsePostProcessing.js';
import type { BackendChatMessage } from '../types/chat.js';

const MAX_CONVERSATION_MESSAGES = 20;
const MAX_CONTEXT_USER_MESSAGES = 10;
const MAX_CONTEXT_ASSISTANT_MESSAGES = 2;
const EXECUTIVE_CHAT_TEMPERATURE = 0.8;
const EXECUTIVE_CHAT_FREQUENCY_PENALTY = 0.24;
const EXECUTIVE_CHAT_PRESENCE_PENALTY = 0.12;
const conversationalStyleReminder =
  'Reply as raw conversational text. No markdown headings, no section titles, no educational formatting, no essay structure, and no bullet-point decomposition by default. Be direct, human, grounded, understated, and natural. Match the rhythm and phrasing of the user language naturally. Do not add forced empathy, therapy language, motivational reassurance, diplomatic balancing, assistant-style endings, automatic follow-up questions, or default advice/coaching language. Shorter is often better.';

function createOpenAiClient() {
  const apiKey = backendEnv.OPENAI_API_KEY.trim();

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY_MISSING');
  }

  return new OpenAI({
    apiKey,
  });
}

function mapMessages(messages: BackendChatMessage[]) {
  const injectedSystemMessages = messages
    .filter((message) => message.role === 'system' && message.content.trim().length > 0)
    .slice(-4)
    .map((message) => ({
      role: 'system' as const,
      content: message.content.trim(),
    }));

  const recentMessages = messages
    .filter(
      (message) => (message.role === 'assistant' || message.role === 'user') && message.content.trim().length > 0,
    )
    .slice(-MAX_CONVERSATION_MESSAGES);

  let includedUserMessages = 0;
  let includedAssistantMessages = 0;

  const conversationMessages: BackendChatMessage[] = [];

  for (let index = recentMessages.length - 1; index >= 0; index -= 1) {
    const message = recentMessages[index];

    if (message.role === 'user') {
      if (includedUserMessages >= MAX_CONTEXT_USER_MESSAGES) {
        continue;
      }

      includedUserMessages += 1;
      conversationMessages.unshift({
        ...message,
        content: message.content.trim(),
      });
      continue;
    }

    if (includedAssistantMessages >= MAX_CONTEXT_ASSISTANT_MESSAGES) {
      continue;
    }

    includedAssistantMessages += 1;
    conversationMessages.unshift({
      ...message,
      content: message.content.trim(),
    });
  }

  return [
    {
      role: 'system' as const,
      content: executiveSystemPrompt,
    },
    ...injectedSystemMessages,
    ...conversationMessages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    {
      role: 'system' as const,
      content: conversationalStyleReminder,
    },
  ];
}

function createBaseChatOptions(messages: BackendChatMessage[]) {
  return {
    model: backendEnv.OPENAI_MODEL,
    temperature: EXECUTIVE_CHAT_TEMPERATURE,
    frequency_penalty: EXECUTIVE_CHAT_FREQUENCY_PENALTY,
    presence_penalty: EXECUTIVE_CHAT_PRESENCE_PENALTY,
    messages: mapMessages(messages),
  };
}

function createNonStreamingChatOptions(
  messages: BackendChatMessage[],
): ChatCompletionCreateParamsNonStreaming {
  return {
    ...createBaseChatOptions(messages),
    stream: false,
  };
}

function createStreamingChatOptions(messages: BackendChatMessage[]): ChatCompletionCreateParamsStreaming {
  return {
    ...createBaseChatOptions(messages),
    stream: true,
  };
}

export async function createChatCompletion(messages: BackendChatMessage[]) {
  const client = createOpenAiClient();

  const response = await client.chat.completions.create(createNonStreamingChatOptions(messages));

  return normalizeAssistantReply(response.choices[0]?.message?.content?.trim() ?? '');
}

export async function createStreamingChatCompletion(
  messages: BackendChatMessage[],
  onToken: (token: string) => void,
) {
  const client = createOpenAiClient();

  const stream = await client.chat.completions.create(createStreamingChatOptions(messages));

  let aggregatedContent = '';

  for await (const chunk of stream) {
    const token = chunk.choices[0]?.delta?.content ?? '';

    if (!token) {
      continue;
    }

    aggregatedContent += token;
    onToken(token);
  }

  return normalizeAssistantReply(aggregatedContent.trim());
}
