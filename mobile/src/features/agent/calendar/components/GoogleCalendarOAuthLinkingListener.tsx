import { useGoogleCalendarOAuthLinking } from '@/src/features/agent/calendar/hooks/useGoogleCalendarOAuthLinking';

export function GoogleCalendarOAuthLinkingListener() {
  useGoogleCalendarOAuthLinking();
  return null;
}
