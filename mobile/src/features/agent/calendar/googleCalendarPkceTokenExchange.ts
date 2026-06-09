import {
  assertGoogleCalendarPkceCodeVerifier,
  buildGooglePkceTokenExchangeBody,
  parseGoogleTokenErrorPayload,
} from '@/src/features/agent/calendar/googleCalendarPkceTokenExchangeBody';

export const GOOGLE_OAUTH_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

export type GoogleCalendarPkceTokenExchangeResult = {
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  scope?: string;
  expiresIn?: number;
};

type GoogleTokenResponsePayload = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  scope?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

export {
  assertGoogleCalendarPkceCodeVerifier,
  buildGooglePkceTokenExchangeBody,
} from '@/src/features/agent/calendar/googleCalendarPkceTokenExchangeBody';

/**
 * Exchange an authorization code using Google's PKCE public-client flow.
 * Never sends client_secret. Never creates a new verifier.
 */
export async function exchangeGoogleCalendarAuthorizationCodeWithPkce(params: {
  clientId: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<GoogleCalendarPkceTokenExchangeResult> {
  const codeVerifier = assertGoogleCalendarPkceCodeVerifier(params.codeVerifier);

  console.log('TOKEN_EXCHANGE_WITH_PKCE');

  const body = buildGooglePkceTokenExchangeBody({
    clientId: params.clientId,
    code: params.code,
    redirectUri: params.redirectUri,
    codeVerifier,
  });

  const response = await fetch(GOOGLE_OAUTH_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  });

  let payload: GoogleTokenResponsePayload;

  try {
    payload = (await response.json()) as GoogleTokenResponsePayload;
  } catch {
    throw new Error('Google OAuth token response was not valid JSON.');
  }

  if (!response.ok || payload.error) {
    const message =
      parseGoogleTokenErrorPayload(payload) ||
      `Google OAuth token exchange failed with status ${response.status}.`;

    if (message.includes('client_secret is missing')) {
      throw new Error(
        'Google Calendar sign-in did not include PKCE verification. Connect again from Home.',
      );
    }

    throw new Error(message);
  }

  if (!payload.access_token) {
    throw new Error('Google OAuth token response did not include an access token.');
  }

  console.log('[GoogleCalendar OAuth] PKCE token exchange success', {
    hasAccessToken: Boolean(payload.access_token),
    hasRefreshToken: Boolean(payload.refresh_token),
    expiresIn: payload.expires_in ?? null,
  });

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token || undefined,
    tokenType: payload.token_type || undefined,
    scope: payload.scope || undefined,
    expiresIn: payload.expires_in,
  };
}
