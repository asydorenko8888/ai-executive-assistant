import { env } from '@/src/shared/config';

export const GOOGLE_CALENDAR_DISABLED_PREVIEW_MESSAGE =
  'Google Calendar disabled in Expo Go preview';

/** Build-time/runtime flag from EXPO_PUBLIC_GOOGLE_CALENDAR_ENABLED. */
export function isGoogleCalendarEnabled() {
  return env.googleCalendarEnabled;
}
