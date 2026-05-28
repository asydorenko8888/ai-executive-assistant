import type { Request, Response } from 'express';
import { Router } from 'express';

import {
  createChatCompletion,
  createStreamingChatCompletion,
} from '../services/openAiChatService.js';
import type { BackendChatMessage } from '../types/chat.js';

type ParsedChatRequest = {
  stream: boolean;
  messages: BackendChatMessage[];
};

function setSseHeaders(response: Response) {
  response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  response.setHeader('Cache-Control', 'no-cache, no-transform');
  response.setHeader('Connection', 'keep-alive');
  response.setHeader('X-Accel-Buffering', 'no');
  response.flushHeaders();
}

function writeSseData(response: Response, payload: unknown) {
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
  (response as Response & { flush?: () => void }).flush?.();
}

function writeSseDone(response: Response) {
  response.write('data: [DONE]\n\n');
}

function isBackendChatMessage(value: unknown): value is BackendChatMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<BackendChatMessage>;

  return (
    (candidate.role === 'system' || candidate.role === 'assistant' || candidate.role === 'user') &&
    typeof candidate.content === 'string' &&
    candidate.content.trim().length > 0
  );
}

function parseChatRequestBody(body: unknown): ParsedChatRequest | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const candidate = body as {
    stream?: unknown;
    messages?: unknown;
  };

  if (!Array.isArray(candidate.messages) || candidate.messages.length === 0) {
    return null;
  }

  if (!candidate.messages.every(isBackendChatMessage)) {
    return null;
  }

  return {
    stream: typeof candidate.stream === 'boolean' ? candidate.stream : true,
    messages: candidate.messages,
  };
}

function handleChatError(response: Response, error: unknown) {
  const errorMessage =
    error instanceof Error && error.message === 'OPENAI_API_KEY_MISSING'
      ? 'Backend OpenAI API key is missing. Add OPENAI_API_KEY to backend/.env before testing chat.'
      : error instanceof Error
        ? error.message
        : 'Unable to process chat request.';

  const errorCode =
    error instanceof Error && error.message === 'OPENAI_API_KEY_MISSING'
      ? 'BACKEND_OPENAI_API_KEY_MISSING'
      : 'CHAT_PROXY_ERROR';

  return response.status(500).json({
    message: errorMessage,
    code: errorCode,
  });
}

export const chatRouter = Router();

chatRouter.post('/chat', async (request: Request, response: Response) => {
  const parsedRequest = parseChatRequestBody(request.body);

  if (!parsedRequest) {
    return response.status(400).json({
      message: 'Invalid chat payload.',
      code: 'CHAT_PAYLOAD_INVALID',
    });
  }

  const { messages, stream } = parsedRequest;

  if (!stream) {
    try {
      const assistantReply = await createChatCompletion(messages);

      return response.status(200).json({
        content: assistantReply,
      });
    } catch (error) {
      return handleChatError(response, error);
    }
  }

  setSseHeaders(response);

  try {
    await createStreamingChatCompletion(messages, (token) => {
      writeSseData(response, {
        choices: [
          {
            delta: {
              content: token,
            },
          },
        ],
      });
    });

    writeSseDone(response);
    response.end();
  } catch (error) {
    if (!response.headersSent) {
      return handleChatError(response, error);
    }

    writeSseData(response, {
      error: {
        message:
          error instanceof Error && error.message === 'OPENAI_API_KEY_MISSING'
            ? 'Backend OpenAI API key is missing. Add OPENAI_API_KEY to backend/.env before testing chat.'
            : error instanceof Error
              ? error.message
              : 'Unable to process chat request.',
      },
    });
    writeSseDone(response);
    response.end();
  }
});
