export type EmailProvider = 'google' | 'outlook' | 'imap';

export type EmailImportance = 'low' | 'normal' | 'high' | 'urgent';

export type EmailMessage = {
  id: string;
  threadId: string;
  subject: string;
  preview: string;
  fromEmail: string;
  fromName?: string;
  receivedAt: string;
  isUnread: boolean;
  importance: EmailImportance;
  labels: string[];
};

export type EmailDigest = {
  date: string;
  unreadCount: number;
  urgentCount: number;
  followUpCount: number;
  topMessages: EmailMessage[];
};
