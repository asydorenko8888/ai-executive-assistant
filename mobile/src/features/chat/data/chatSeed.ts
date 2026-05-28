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
      'Ready when you are. I can help you prioritize decisions, draft stakeholder messages, prepare meetings, or pressure-test a plan. What do you want to move forward right now?',
    createdAt: '08:44',
    status: 'read',
  },
];
