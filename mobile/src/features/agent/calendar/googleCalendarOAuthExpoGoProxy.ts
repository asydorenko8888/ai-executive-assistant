import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import sessionUrlProvider from 'expo-auth-session/build/SessionUrlProvider';

import {
  buildExpoGoAppReturnUri,
  EXPO_GO_AUTH_PROXY_PROJECT_FULL_NAME,
  logGoogleCalendarOAuthEvent,
} from '@/src/features/agent/calendar/googleCalendarOAuthEnvironment';
import { storeGoogleCalendarPkceAuthFromAuthRequest } from '@/src/features/agent/calendar/googleCalendarPkceAuthStore';

function readRedirectUriFromAuthUrl(authUrl: string) {
  try {
    return new URL(authUrl).searchParams.get('redirect_uri');
  } catch {
    return null;
  }
}

function decodeOAuthParam(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function verifyGoogleOAuthRedirectUriMatch(params: {
  configuredProxyRedirectUri: string;
  authUrl: string;
}) {
  const redirectUriInAuthUrl = decodeOAuthParam(readRedirectUriFromAuthUrl(params.authUrl));

  return {
    configuredProxyRedirectUri: params.configuredProxyRedirectUri,
    redirectUriInAuthUrl,
    matches:
      Boolean(redirectUriInAuthUrl) &&
      redirectUriInAuthUrl === params.configuredProxyRedirectUri,
  };
}

/**
 * Expo Go must open auth.expo.io/start with the exp:// return URL.
 * Opening Google directly with an https://auth.expo.io redirect_uri leaves the
 * proxy without returnURL and shows "Something went wrong trying to finish signing in".
 */
export async function promptGoogleCalendarAuthViaExpoProxy(params: {
  authRequest: AuthSession.AuthRequest;
  discovery: AuthSession.DiscoveryDocument;
  proxyRedirectUri: string;
}) {
  const appReturnUri = buildExpoGoAppReturnUri();
  const authUrl = await params.authRequest.makeAuthUrlAsync(params.discovery);
  const redirectUriMatch = verifyGoogleOAuthRedirectUriMatch({
    configuredProxyRedirectUri: params.proxyRedirectUri,
    authUrl,
  });
  const proxyStartUrl = sessionUrlProvider.getStartUrl(
    authUrl,
    appReturnUri,
    EXPO_GO_AUTH_PROXY_PROJECT_FULL_NAME,
  );
  const requestConfig = await params.authRequest.getAuthRequestConfigAsync();

  logGoogleCalendarOAuthEvent('PROXY_FLOW_START', {
    proxyRedirectUri: params.proxyRedirectUri,
    appReturnUri,
    proxyStartUrl,
    authUrl,
    redirectUriMatch,
    requestConfig: {
      redirectUri: requestConfig.redirectUri,
      clientId: requestConfig.clientId,
      scopes: requestConfig.scopes,
      responseType: requestConfig.responseType,
      usePKCE: params.authRequest.usePKCE,
      state: requestConfig.state,
      extraParams: requestConfig.extraParams,
    },
  });

  console.log('GOOGLE_CALENDAR_OAUTH_PROXY', {
    redirectUri: params.proxyRedirectUri,
    appReturnUri,
    authUrl,
    proxyStartUrl,
    redirectUriMatch,
    scopes: requestConfig.scopes,
    responseType: requestConfig.responseType,
    state: requestConfig.state,
  });

  await storeGoogleCalendarPkceAuthFromAuthRequest({
    authRequest: params.authRequest,
    clientId: requestConfig.clientId,
    redirectUri: params.proxyRedirectUri,
    authUrl,
  });

  let browserResult: WebBrowser.WebBrowserAuthSessionResult;

  try {
    browserResult = await WebBrowser.openAuthSessionAsync(proxyStartUrl, appReturnUri);
  } catch (error) {
    logGoogleCalendarOAuthEvent('PROXY_BROWSER_ERROR', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null,
    });
    throw error;
  }

  logGoogleCalendarOAuthEvent('PROXY_BROWSER_RESULT', {
    type: browserResult.type,
    url: browserResult.type === 'success' ? browserResult.url : null,
  });

  console.log('GOOGLE_CALENDAR_OAUTH_AUTH_RESPONSE', browserResult);

  if (browserResult.type !== 'success') {
    return { type: browserResult.type } as AuthSession.AuthSessionResult;
  }

  const authResult = params.authRequest.parseReturnUrl(browserResult.url);

  logGoogleCalendarOAuthEvent('PROXY_AUTH_PARSED', {
    type: authResult.type,
    url: authResult.type === 'success' || authResult.type === 'error' ? authResult.url : null,
    code: authResult.type === 'success' ? authResult.params.code ?? null : null,
    state: authResult.type === 'success' ? authResult.params.state ?? null : null,
    error: authResult.type === 'error' ? authResult.error?.message ?? authResult.params.error : null,
    errorDescription:
      authResult.type === 'success' ? authResult.params.error_description ?? null : null,
  });

  console.log('GOOGLE_CALENDAR_OAUTH_AUTH_CODE', {
    hasCode: authResult.type === 'success' ? Boolean(authResult.params.code) : false,
    codeLength:
      authResult.type === 'success' && authResult.params.code
        ? authResult.params.code.length
        : 0,
    state: authResult.type === 'success' ? authResult.params.state ?? null : null,
  });

  return authResult;
}
