export const queryKeys = {
  home: {
    root: ['home'] as const,
    dashboard: () => ['home', 'dashboard'] as const,
  },
  assistant: {
    root: ['assistant'] as const,
    session: () => ['assistant', 'session'] as const,
    voice: () => ['assistant', 'voice'] as const,
  },
  calendar: {
    root: ['calendar'] as const,
    summary: () => ['calendar', 'summary'] as const,
    events: (date?: string) => ['calendar', 'events', date ?? 'upcoming'] as const,
  },
  tasks: {
    root: ['tasks'] as const,
    list: (status?: string) => ['tasks', 'list', status ?? 'all'] as const,
  },
  notifications: {
    root: ['notifications'] as const,
    feed: () => ['notifications', 'feed'] as const,
  },
  chat: {
    root: ['chat'] as const,
    thread: (threadId: string) => ['chat', 'thread', threadId] as const,
  },
  realtime: {
    root: ['realtime'] as const,
    channels: () => ['realtime', 'channels'] as const,
  },
} as const;
