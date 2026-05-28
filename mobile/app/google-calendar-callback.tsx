import { useEffect, useState } from 'react';

import { useRouter } from 'expo-router';

import {
  completeGoogleCalendarWebOAuthRedirect,
  GOOGLE_CALENDAR_WEB_CALLBACK_PATH,
} from '@/src/features/agent/calendar';
import { LoadingScreen } from '@/src/shared/ui';

/** Expo Router path: `/` + {@link GOOGLE_CALENDAR_WEB_CALLBACK_PATH} → `/google-calendar-callback` */
export const GOOGLE_CALENDAR_WEB_CALLBACK_ROUTE =
  `/${GOOGLE_CALENDAR_WEB_CALLBACK_PATH}` as const;

export default function GoogleCalendarCallbackScreen() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      const result = await completeGoogleCalendarWebOAuthRedirect();

      if (!isMounted) {
        return;
      }

      if (!result.success && result.errorMessage) {
        setErrorMessage(result.errorMessage);
        return;
      }

      router.replace('/');
    })();

    return () => {
      isMounted = false;
    };
  }, [router]);

  if (errorMessage) {
    return (
      <LoadingScreen
        title="Calendar connection failed"
        description={errorMessage}
      />
    );
  }

  return (
    <LoadingScreen
      title="Connecting Google Calendar"
      description="Finishing sign-in and saving your connection…"
    />
  );
}
