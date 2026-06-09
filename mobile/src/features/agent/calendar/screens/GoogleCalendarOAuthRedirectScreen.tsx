import { useEffect, useRef, useState } from 'react';

import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useQueryClient } from '@tanstack/react-query';

import { appendResumedCalendarActionReply } from '@/src/features/agent/calendar/calendarAuthPostResume';
import { refreshGoogleCalendarConnectionState } from '@/src/features/agent/calendar/googleCalendarAuth';
import { handleGoogleCalendarOAuthRedirectFromUrl } from '@/src/features/agent/calendar/googleCalendarOAuthRedirectHandler';
import { resolveGoogleCalendarOAuthRedirectCallback } from '@/src/features/agent/calendar/googleCalendarOAuthRedirectUrlParser';
import { queryKeys } from '@/src/shared/api';
import { LoadingScreen } from '@/src/shared/ui';

type RedirectUiState = 'loading' | 'success' | 'error';

export { readGoogleCalendarOAuthRedirectParams } from '@/src/features/agent/calendar/googleCalendarOAuthRedirectParams';

export default function GoogleCalendarOAuthRedirectScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useLocalSearchParams();
  const hasStartedRef = useRef(false);
  const [uiState, setUiState] = useState<RedirectUiState>('loading');
  const [statusMessage, setStatusMessage] = useState(
    'Finishing sign-in and saving your connection…',
  );

  useEffect(() => {
    if (hasStartedRef.current) {
      return;
    }

    hasStartedRef.current = true;
    WebBrowser.maybeCompleteAuthSession();

    void (async () => {
      const parsedCallback = await resolveGoogleCalendarOAuthRedirectCallback(searchParams);
      const callbackUrl = parsedCallback.sourceUrl;
      const oauthParams = parsedCallback.oauthParams;

      console.log('[GoogleCalendar OAuth] oauthredirect route loaded', {
        callbackUrl,
        hasCode: Boolean(oauthParams.code),
        hasState: Boolean(oauthParams.state),
        hasError: Boolean(oauthParams.error),
      });

      if (oauthParams.error) {
        console.log('[GoogleCalendar OAuth] OAuth error param', oauthParams.error);
        setUiState('error');
        setStatusMessage(
          oauthParams.error === 'access_denied'
            ? 'Google Calendar write access was not granted. Try connecting again and approve calendar permissions.'
            : oauthParams.error,
        );
        return;
      }

      const result = await handleGoogleCalendarOAuthRedirectFromUrl(callbackUrl);

      if (!result.success) {
        console.log(
          '[GoogleCalendar OAuth] oauthredirect completion failed',
          result.errorMessage ?? null,
        );
        setUiState('error');
        setStatusMessage(
          result.errorMessage ??
            'Could not finish Google Calendar sign-in. Connect again from Home.',
        );
        return;
      }

      const capabilities = await refreshGoogleCalendarConnectionState();
      await queryClient.invalidateQueries({ queryKey: queryKeys.agent.homePreview() });
      await appendResumedCalendarActionReply();

      const email = result.connectedEmail ?? capabilities.connection.connectedEmail;
      setUiState('success');
      setStatusMessage(
        email
          ? `Google Calendar connected as ${email}. Returning to Home…`
          : 'Google Calendar connected successfully. Returning to Home…',
      );

      setTimeout(() => {
        router.replace('/(tabs)');
      }, 1200);
    })();
  }, [queryClient, router, searchParams]);

  if (uiState === 'error') {
    return (
      <LoadingScreen title="Calendar connection failed" description={statusMessage} />
    );
  }

  if (uiState === 'success') {
    return (
      <LoadingScreen title="Google Calendar connected" description={statusMessage} />
    );
  }

  return (
    <LoadingScreen
      title="Connecting Google Calendar"
      description={statusMessage}
    />
  );
}
