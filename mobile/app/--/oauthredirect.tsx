import { Stack } from 'expo-router';

import GoogleCalendarOAuthRedirectScreen from '@/src/features/agent/calendar/screens/GoogleCalendarOAuthRedirectScreen';

/**
 * Expo Router file route: /--/oauthredirect (Expo Go AuthSession return path)
 * Must match GOOGLE_CALENDAR_OAUTH_REDIRECT_LEGACY_ROUTE in googleCalendarOAuthRoutes.ts
 */
export default function GoogleCalendarOAuthRedirectLegacyRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false, title: 'Google Calendar' }} />
      <GoogleCalendarOAuthRedirectScreen />
    </>
  );
}
