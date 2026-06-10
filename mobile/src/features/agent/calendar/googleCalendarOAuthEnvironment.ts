import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

import * as AuthSession from 'expo-auth-session';
import sessionUrlProvider from 'expo-auth-session/build/SessionUrlProvider';

import { resolveGoogleCalendarAndroidOAuthRedirectUri } from '@/src/features/agent/calendar/googleCalendarAndroidOAuth';
import {
  selectGoogleCalendarOAuthClientId,
  type GoogleCalendarClientIdSources,
  type GoogleCalendarOAuthRuntime,
} from '@/src/features/agent/calendar/googleCalendarOAuthPolicy';
import { GOOGLE_CALENDAR_WEB_CALLBACK_PATH } from '@/src/features/agent/calendar/googleCalendarOAuthRoutes';
import { isGoogleCalendarEnabled } from '@/src/features/agent/calendar/googleCalendarFeatureFlag';
import { env } from '@/src/shared/config';

export const EXPO_GO_AUTH_PROXY_PROJECT_FULL_NAME = '@andriysydorenko/mobile';

export type { GoogleCalendarClientIdSources, GoogleCalendarOAuthRuntime };

export function buildExpoGoAppReturnUri() {
  return AuthSession.makeRedirectUri({
    path: 'oauthredirect',
  });
}

export type GoogleCalendarOAuthConfigDiagnostics = {
  runtime: GoogleCalendarOAuthRuntime;
  platform: typeof Platform.OS;
  clientIdSource: 'web' | 'ios' | 'android' | 'missing';
  clientIdLoaded: boolean;
  clientIds: {
    webLoaded: boolean;
    iosLoaded: boolean;
    androidLoaded: boolean;
  };
  redirectUri: string;
};

export function resolveGoogleCalendarOAuthRuntime(): GoogleCalendarOAuthRuntime {
  if (Platform.OS === 'web') {
    return 'web';
  }

  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return 'expo_go';
  }

  return 'native';
}

export function isGoogleCalendarExpoGoClient() {
  return resolveGoogleCalendarOAuthRuntime() === 'expo_go';
}

export function resolveGoogleCalendarClientIdSources(): GoogleCalendarClientIdSources {
  return {
    web: env.googleCalendarWebClientId,
    ios: env.googleCalendarIosClientId,
    android: env.googleCalendarAndroidClientId,
  };
}

export function resolveGoogleCalendarOAuthClientId(
  runtime: GoogleCalendarOAuthRuntime = resolveGoogleCalendarOAuthRuntime(),
): string {
  return selectGoogleCalendarOAuthClientId({
    runtime,
    platform: Platform.OS,
    sources: resolveGoogleCalendarClientIdSources(),
  }).clientId;
}

export function resolveGoogleCalendarOAuthClientIdSource(
  runtime: GoogleCalendarOAuthRuntime = resolveGoogleCalendarOAuthRuntime(),
): GoogleCalendarOAuthConfigDiagnostics['clientIdSource'] {
  return selectGoogleCalendarOAuthClientId({
    runtime,
    platform: Platform.OS,
    sources: resolveGoogleCalendarClientIdSources(),
  }).source;
}

export function buildGoogleCalendarOAuthRedirectUri(
  runtime: GoogleCalendarOAuthRuntime = resolveGoogleCalendarOAuthRuntime(),
): string {
  if (!isGoogleCalendarEnabled()) {
    return '';
  }

  if (runtime === 'web') {
    const uri = AuthSession.makeRedirectUri({
      path: GOOGLE_CALENDAR_WEB_CALLBACK_PATH,
      preferLocalhost: true,
    });

    try {
      const parsed = new URL(uri);
      const normalizedPathname = `/${GOOGLE_CALENDAR_WEB_CALLBACK_PATH}`;

      if (parsed.pathname.replace(/\/+$/, '') !== normalizedPathname) {
        parsed.pathname = normalizedPathname;
        return parsed.toString();
      }
    } catch {
      // Fall through to AuthSession value.
    }

    return uri;
  }

  if (runtime === 'expo_go') {
    // Expo Go: HTTPS AuthSession proxy (Google rejects exp:// redirect URIs).
    const proxyRedirectUri = sessionUrlProvider.getRedirectUrl({
      projectNameForProxy: EXPO_GO_AUTH_PROXY_PROJECT_FULL_NAME,
    });

    console.log('GOOGLE_REDIRECT_URI_FINAL', proxyRedirectUri);

    return proxyRedirectUri;
  }

  if (Platform.OS === 'android') {
    const androidRedirectUri = resolveGoogleCalendarAndroidOAuthRedirectUri();

    console.log('GOOGLE_REDIRECT_URI_FINAL', androidRedirectUri);
    console.log('GOOGLE_CALENDAR_ANDROID_OAUTH_CLIENT_TYPE', 'android');

    return androidRedirectUri;
  }

  const redirectUri = AuthSession.makeRedirectUri({
    scheme: 'mobile',
    path: 'oauthredirect',
    native: 'mobile://oauthredirect',
  });

  console.log('GOOGLE_REDIRECT_URI_FINAL', redirectUri);

  return redirectUri;
}

export function getGoogleCalendarOAuthConfigDiagnostics(): GoogleCalendarOAuthConfigDiagnostics {
  const runtime = resolveGoogleCalendarOAuthRuntime();
  const sources = resolveGoogleCalendarClientIdSources();
  const clientIdSource = resolveGoogleCalendarOAuthClientIdSource(runtime);
  const clientId = resolveGoogleCalendarOAuthClientId(runtime);

  return {
    runtime,
    platform: Platform.OS,
    clientIdSource,
    clientIdLoaded: Boolean(clientId),
    clientIds: {
      webLoaded: Boolean(sources.web),
      iosLoaded: Boolean(sources.ios),
      androidLoaded: Boolean(sources.android),
    },
    redirectUri: buildGoogleCalendarOAuthRedirectUri(runtime),
  };
}

export function maskGoogleCalendarClientId(clientId: string) {
  const trimmed = clientId.trim();

  if (!trimmed) {
    return '';
  }

  if (trimmed.length <= 16) {
    return '***';
  }

  return `${trimmed.slice(0, 10)}...${trimmed.slice(-6)}`;
}

export function logGoogleCalendarOAuthEvent(
  stage:
    | 'BUTTON_PRESSED'
    | 'CONNECT_START'
    | 'AUTH_REQUEST_CREATED'
    | 'REDIRECT_URI'
    | 'CLIENT_IDS'
    | 'PROMPT_START'
    | 'AUTH_RESULT'
    | 'AUTH_ERROR'
    | 'CONNECT_FAILED'
    | 'CONNECT_SUCCESS'
    | 'AUTH_REQUEST_INSPECTION'
    | 'PROXY_FLOW_START'
    | 'PROXY_BROWSER_RESULT'
    | 'PROXY_BROWSER_ERROR'
    | 'PROXY_AUTH_PARSED'
    | 'TOKEN_EXCHANGE_START'
    | 'TOKEN_EXCHANGE_SUCCESS'
    | 'TOKEN_EXCHANGE_ERROR',
  details: Record<string, unknown>,
) {
  console.log(`GOOGLE_CALENDAR_OAUTH_${stage}`, details);
}
