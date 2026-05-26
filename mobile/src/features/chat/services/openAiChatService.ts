import type { ChatMessage } from '@/src/entities/chat/types';
import { ApiError, createOpenAiClient, toApiError } from '@/src/shared/api';
import { env } from '@/src/shared/config';

const EXECUTIVE_CHAT_MODEL = 'gpt-4o-mini';

type OpenAiChatCompletionRequest = {
  model: string;
  temperature: number;
  messages: {
    role: 'system' | 'assistant' | 'user';
    content: string;
  }[];
};

type OpenAiChatCompletionResponse = {
  choices?: {
    message?: {
      content?: string | null;
    };
  }[];
};

const executiveSystemPrompt = `You are an executive AI assistant for a founder and operator. 
Reply concisely, strategically, and with premium executive tone.
Focus on clarity, prioritization, decision support, stakeholder communication, and next actions.
Keep answers practical and mobile-friendly.`;

function assertOpenAiApiKey() {
  if (env.openAiApiKey.trim()) {
    return;
  }

  throw new ApiError({
    message:
      'OpenAI API key is missing. Add EXPO_PUBLIC_OPENAI_API_KEY to your local .env file to enable real AI chat.',
    status: 401,
    code: 'OPENAI_API_KEY_MISSING',
    retryable: false,
  });
}

function mapMessagesForOpenAi(messages: ChatMessage[]) {
  return messages
    .filter((message) => message.role === 'assistant' || message.role === 'user' || message.role === 'system')
    .map((message) => ({
      role: message.role === 'assistant' || message.role === 'system' ? message.role : 'user',
      content: message.content,
    }));
}

export async function sendExecutiveChatMessage(messages: ChatMessage[]) {
  assertOpenAiApiKey();

  const client = createOpenAiClient(env.openAiApiKey);

  try {
    const response = await client.post<OpenAiChatCompletionResponse, OpenAiChatCompletionRequest>({
      path: '/chat/completions',
      body: {
        model: EXECUTIVE_CHAT_MODEL,
        temperature: 0.7,
        messages: [
          {
            role: 'system',
            content: executiveSystemPrompt,
          },
          ...mapMessagesForOpenAi(messages),
        ],
      },
    });

    const assistantReply = response.choices?.[0]?.message?.content?.trim();

    if (!assistantReply) {
      throw new ApiError({
        message: 'OpenAI returned an empty response.',
        status: 502,
        code: 'OPENAI_EMPTY_RESPONSE',
        retryable: true,
      });
    }

    return assistantReply;
  } catch (error) {
    throw toApiError(error);
  }
}
