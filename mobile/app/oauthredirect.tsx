import { Stack } from 'expo-router';

import GoogleCalendarOAuthRedirectScreen from '@/src/features/agent/calendar/screens/GoogleCalendarOAuthRedirectScreen';

/**
 * Expo Router file route: /oauthredirect
 * Must match GOOGLE_CALENDAR_OAUTH_REDIRECT_PATH in googleCalendarOAuthRoutes.ts
 */
export default function GoogleCalendarOAuthRedirectRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false, title: 'Google Calendar' }} />
      <GoogleCalendarOAuthRedirectScreen />
    </>
  );
}
