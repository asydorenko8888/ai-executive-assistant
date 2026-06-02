import { Stack } from 'expo-router';

import GoogleCalendarOAuthCallbackScreen from '@/src/features/agent/calendar/screens/GoogleCalendarOAuthCallbackScreen';

/**
 * Expo Router file route: /google-calendar-callback
 * Must match GOOGLE_CALENDAR_WEB_CALLBACK_PATH in googleCalendarOAuthRoutes.ts
 */
export default function GoogleCalendarCallbackRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false, title: 'Google Calendar' }} />
      <GoogleCalendarOAuthCallbackScreen />
    </>
  );
}
