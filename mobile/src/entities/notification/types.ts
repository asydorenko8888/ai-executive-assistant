export type NotificationChannel = 'push' | 'in_app' | 'email';
export type NotificationPriority = 'normal' | 'important' | 'critical';

export type AssistantNotification = {
  id: string;
  title: string;
  body: string;
  channel: NotificationChannel;
  priority: NotificationPriority;
  createdAt: string;
  readAt?: string;
};
