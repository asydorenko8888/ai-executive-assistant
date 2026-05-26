import type { ChatMessage, ChatThread } from '@/src/entities/chat/types';

export const executiveChatThread: ChatThread = {
  id: 'executive-briefing',
  title: 'Executive AI',
  updatedAt: '08:45',
};

export const executiveChatMessages: ChatMessage[] = [
  {
    id: 'assistant-1',
    role: 'assistant',
    content:
      'Good morning, Andriy. I have prepared your leadership brief with today’s meetings, open follow-ups, and the highest-priority decisions awaiting you.',
    createdAt: '08:42',
    status: 'read',
  },
  {
    id: 'user-1',
    role: 'user',
    content: 'What needs my attention before noon?',
    createdAt: '08:43',
    status: 'read',
  },
  {
    id: 'assistant-2',
    role: 'assistant',
    content:
      'Three items stand out: finalize the investor sync narrative, approve the board prep summary, and confirm delegation for the afternoon leadership reviews.',
    createdAt: '08:44',
    status: 'read',
  },
];

export const chatVoicePrompt =
  'Create a concise executive brief for today and highlight the top risks before noon.';
