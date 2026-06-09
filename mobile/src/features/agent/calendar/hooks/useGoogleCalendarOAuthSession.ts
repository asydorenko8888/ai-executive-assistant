import { useCallback, useMemo } from 'react';
import { Platform } from 'react-native';

import * as AuthSession from 'expo-auth-session';

import {
  getGoogleCalendarClientId,
  getGoogleCalendarRedirectUri,
  GOOGLE_CALENDAR_DISCOVERY_ISSUER,
  googleCalendarOAuthScopes,
} from '@/src/features/agent/calendar/googleCalendarAuth';
import { isGoogleCalendarEnabled } from '@/src/features/agent/calendar/googleCalendarFeatureFlag';

const GOOGLE_CALENDAR_OAUTH_ENABLED = isGoogleCalendarEnabled();

function useDisabledGoogleCalendarOAuthSession() {
  const promptGoogleCalendarAuthAsync = useCallback(
    async () => ({ type: 'dismiss' as const }),
    [],
  );

  return {
    discovery: null as AuthSession.DiscoveryDocument | null,
    authRequest: null as AuthSession.AuthRequest | null,
    promptGoogleCalendarAuthAsync,
    clientId: '',
    redirectUri: '',
    isClientIdLoaded: false,
  };
}

function useEnabledGoogleCalendarOAuthSession() {
  const clientId = getGoogleCalendarClientId();
  const redirectUri = getGoogleCalendarRedirectUri();
  const discovery = AuthSession.useAutoDiscovery(GOOGLE_CALENDAR_DISCOVERY_ISSUER);
  const authRequestConfig = useMemo(
    () => ({
      clientId: clientId || 'missing-google-calendar-client-id',
      scopes: [...googleCalendarOAuthScopes],
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
      extraParams: {
        access_type: 'offline',
        include_granted_scopes: 'true',
        prompt: 'consent select_account',
      },
    }),
    [clientId, redirectUri],
  );
  const [authRequest, , promptGoogleCalendarAuthAsync] = AuthSession.useAuthRequest(
    authRequestConfig,
    discovery,
  );

  return {
    discovery,
    authRequest,
    promptGoogleCalendarAuthAsync,
    clientId,
    redirectUri,
    isClientIdLoaded: Boolean(clientId),
  };
}

/**
 * AuthSession hooks are skipped entirely when EXPO_PUBLIC_GOOGLE_CALENDAR_ENABLED=false.
 * The flag is fixed for the app lifetime, so conditional hook usage is safe here.
 */
export function useGoogleCalendarOAuthSession() {
  if (GOOGLE_CALENDAR_OAUTH_ENABLED) {
    return useEnabledGoogleCalendarOAuthSession();
  }

  return useDisabledGoogleCalendarOAuthSession();
}

export function resolveGoogleCalendarConnectReady(params: {
  enabled: boolean;
  isClientIdLoaded: boolean;
  discovery: AuthSession.DiscoveryDocument | null;
  authRequest: AuthSession.AuthRequest | null;
}) {
  if (!params.enabled) {
    return false;
  }

  return Platform.OS !== 'web'
    ? params.isClientIdLoaded
    : Boolean(params.isClientIdLoaded && params.discovery && params.authRequest);
}

export function resolvePreparingGoogleCalendarConnection(params: {
  enabled: boolean;
  isClientIdLoaded: boolean;
  discovery: AuthSession.DiscoveryDocument | null;
  authRequest: AuthSession.AuthRequest | null;
}) {
  if (!params.enabled) {
    return false;
  }

  return (
    Platform.OS === 'web' &&
    params.isClientIdLoaded &&
    (!params.discovery || !params.authRequest)
  );
}
