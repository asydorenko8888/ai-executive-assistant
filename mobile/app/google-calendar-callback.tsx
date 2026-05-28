import { useEffect, useState } from 'react';

import { useRouter } from 'expo-router';

import { completeGoogleCalendarWebOAuthRedirect } from '@/src/features/agent/calendar';
import { LoadingScreen } from '@/src/shared/ui';

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
