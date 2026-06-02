import { useEffect, useMemo, useRef, useState } from 'react';

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { appendResumedCalendarActionReply } from '@/src/features/agent/calendar/calendarAuthPostResume';
import {
  completeGoogleCalendarWebOAuthRedirect,
  refreshGoogleCalendarConnectionState,
  type GoogleCalendarWebOAuthCallbackParams,
} from '@/src/features/agent/calendar/googleCalendarAuth';
import { queryKeys } from '@/src/shared/api';
import { LoadingScreen } from '@/src/shared/ui';

export function readGoogleCalendarOAuthCallbackParams(
  searchParams: Record<string, string | string[] | undefined>,
): GoogleCalendarWebOAuthCallbackParams {
  const read = (key: string) => {
    const value = searchParams[key];

    if (typeof value === 'string') {
      return value;
    }

    if (Array.isArray(value) && typeof value[0] === 'string') {
      return value[0];
    }

    return null;
  };

  return {
    code: read('code'),
    state: read('state'),
    error: read('error'),
  };
}

export function readGoogleCalendarOAuthCallbackParamsFromLocation(): GoogleCalendarWebOAuthCallbackParams {
  if (typeof window === 'undefined') {
    return { code: null, state: null, error: null };
  }

  const url = new URL(window.location.href);

  return {
    code: url.searchParams.get('code'),
    state: url.searchParams.get('state'),
    error: url.searchParams.get('error'),
  };
}

type CallbackUiState = 'loading' | 'success' | 'error';

export default function GoogleCalendarOAuthCallbackScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useLocalSearchParams();
  const hasStartedRef = useRef(false);
  const oauthParams = useMemo(() => {
    const fromRouter = readGoogleCalendarOAuthCallbackParams(searchParams);
    const hasRouterParams = Boolean(fromRouter.code || fromRouter.state || fromRouter.error);

    if (hasRouterParams) {
      return fromRouter;
    }

    return readGoogleCalendarOAuthCallbackParamsFromLocation();
  }, [searchParams]);
  const [uiState, setUiState] = useState<CallbackUiState>('loading');
  const [statusMessage, setStatusMessage] = useState(
    'Finishing sign-in and saving your connection…',
  );

  useEffect(() => {
    if (hasStartedRef.current) {
      return;
    }

    hasStartedRef.current = true;

    console.log('[GoogleCalendar OAuth] callback route loaded');
    console.log('[GoogleCalendar OAuth] received code/state', {
      hasCode: Boolean(oauthParams.code),
      hasState: Boolean(oauthParams.state),
      hasError: Boolean(oauthParams.error),
      error: oauthParams.error ?? null,
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

    let isMounted = true;

    void (async () => {
      const result = await completeGoogleCalendarWebOAuthRedirect(oauthParams);

      if (!isMounted) {
        return;
      }

      if (!result.success) {
        console.log('[GoogleCalendar OAuth] callback completion failed', result.errorMessage ?? null);
        setUiState('error');
        setStatusMessage(
          result.errorMessage ??
            'Could not finish Google Calendar sign-in. Connect again from Home or Settings.',
        );
        return;
      }

      const capabilities = await refreshGoogleCalendarConnectionState();
      await queryClient.invalidateQueries({ queryKey: queryKeys.agent.homePreview() });
      await appendResumedCalendarActionReply();

      if (!isMounted) {
        return;
      }

      const email = result.connectedEmail ?? capabilities.connection.connectedEmail;
      setUiState('success');
      setStatusMessage(
        email
          ? `Google Calendar connected as ${email}. Returning to the app…`
          : 'Google Calendar connected successfully. Returning to the app…',
      );

      setTimeout(() => {
        if (!isMounted) {
          return;
        }

        router.replace('/(tabs)/settings');
      }, 1500);
    })();

    return () => {
      isMounted = false;
    };
  }, [oauthParams, queryClient, router]);

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
