import { Redirect, Stack, usePathname } from 'expo-router';

import GoogleCalendarOAuthRedirectScreen from '@/src/features/agent/calendar/screens/GoogleCalendarOAuthRedirectScreen';
import { pathnameContainsGoogleCalendarOAuthRedirect } from '@/src/features/agent/calendar/googleCalendarOAuthRedirectHandler';

/**
 * Catch-all for unmatched deep links whose path contains oauthredirect.
 */
export default function GoogleCalendarOAuthRedirectCatchAllRoute() {
  const pathname = usePathname() ?? '';

  if (!pathnameContainsGoogleCalendarOAuthRedirect(pathname)) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false, title: 'Google Calendar' }} />
      <GoogleCalendarOAuthRedirectScreen />
    </>
  );
}
