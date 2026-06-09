import type * as AuthSession from 'expo-auth-session';

import { logGoogleCalendarOAuthEvent } from '@/src/features/agent/calendar/googleCalendarOAuthEnvironment';

type GoogleCalendarAuthRequestConfig = Awaited<
  ReturnType<AuthSession.AuthRequest['getAuthRequestConfigAsync']>
>;

function parseAuthorizationUrlParams(authorizationUrl: string) {
  try {
    const parsedUrl = new URL(authorizationUrl);

    return Object.fromEntries(parsedUrl.searchParams.entries());
  } catch {
    return {};
  }
}

function redactAuthorizationUrl(authorizationUrl: string) {
  try {
    const parsedUrl = new URL(authorizationUrl);

    if (parsedUrl.searchParams.has('code_challenge')) {
      parsedUrl.searchParams.set('code_challenge', '***');
    }

    return parsedUrl.toString();
  } catch {
    return authorizationUrl;
  }
}

function buildInspectableAuthRequestConfig(
  config: GoogleCalendarAuthRequestConfig,
  authRequest: AuthSession.AuthRequest,
) {
  return {
    redirectUri: config.redirectUri,
    clientId: config.clientId,
    scopes: config.scopes ?? [],
    responseType: config.responseType,
    usePKCE: authRequest.usePKCE ?? null,
    useProxy: null,
    state: config.state ?? null,
    codeChallengeMethod: config.codeChallengeMethod ?? null,
    hasCodeChallenge: Boolean(config.codeChallenge),
    hasCodeVerifier: Boolean(authRequest.codeVerifier),
    extraParams: config.extraParams ?? {},
    prompt: config.prompt ?? null,
    clientSecret: config.clientSecret ? '***' : null,
  };
}

/**
 * Logs the exact OAuth authorization request Google receives (no secrets).
 * Call immediately before AuthRequest.promptAsync().
 */
export async function logGoogleCalendarAuthRequestInspection(
  authRequest: AuthSession.AuthRequest,
  discovery: AuthSession.DiscoveryDocument,
) {
  const config = await authRequest.getAuthRequestConfigAsync();
  const authorizationUrl = await authRequest.makeAuthUrlAsync(discovery);
  const urlParams = parseAuthorizationUrlParams(authorizationUrl);
  const authRequestConfig = buildInspectableAuthRequestConfig(config, authRequest);

  logGoogleCalendarOAuthEvent('AUTH_REQUEST_INSPECTION', {
    redirectUri: config.redirectUri,
    clientId: config.clientId,
    scopes: config.scopes ?? [],
    responseType: config.responseType,
    useProxy: null,
    useProxyNote: 'not used — AuthRequest has no useProxy option in Expo SDK 54',
    authRequestConfig,
    authorizationEndpoint: discovery.authorizationEndpoint ?? null,
    authorizationUrlRedacted: redactAuthorizationUrl(authorizationUrl),
    googleQueryParams: {
      redirect_uri: urlParams.redirect_uri ?? null,
      client_id: urlParams.client_id ?? null,
      scope: urlParams.scope ?? null,
      response_type: urlParams.response_type ?? null,
      state: urlParams.state ?? null,
      code_challenge_method: urlParams.code_challenge_method ?? null,
      access_type: urlParams.access_type ?? null,
      include_granted_scopes: urlParams.include_granted_scopes ?? null,
      prompt: urlParams.prompt ?? null,
    },
  });

  console.log('GOOGLE_CALENDAR_OAUTH_INSPECTION', {
    redirectUri: config.redirectUri,
    clientId: config.clientId,
    scopes: config.scopes ?? [],
    responseType: config.responseType,
    useProxy: null,
    authRequestConfig,
    redirect_uri_sent_to_google: urlParams.redirect_uri ?? null,
    authorizationUrlRedacted: redactAuthorizationUrl(authorizationUrl),
  });

  return {
    authorizationUrl,
    redirectUriSentToGoogle: urlParams.redirect_uri ?? config.redirectUri,
    authRequestConfig,
  };
}
