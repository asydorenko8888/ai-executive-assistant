import { backendEnv } from '../config/env.js';

const GOOGLE_OAUTH_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/userinfo';

export type GoogleOAuthTokenResult = {
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  scope?: string;
  expiresIn?: number;
  connectedEmail?: string;
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

function getGoogleOAuthClientConfig() {
  const clientId = backendEnv.GOOGLE_CALENDAR_WEB_CLIENT_ID;
  const clientSecret = backendEnv.GOOGLE_CALENDAR_WEB_CLIENT_SECRET;

  if (!clientId) {
    throw new Error('GOOGLE_CALENDAR_WEB_CLIENT_ID_MISSING');
  }

  if (!clientSecret) {
    throw new Error('GOOGLE_CALENDAR_WEB_CLIENT_SECRET_MISSING');
  }

  return {
    clientId,
    clientSecret,
  };
}

async function parseGoogleTokenError(response: Response) {
  let payload: GoogleTokenResponsePayload | null = null;

  try {
    payload = (await response.json()) as GoogleTokenResponsePayload;
  } catch {
    payload = null;
  }

  const details = payload?.error_description || payload?.error || response.statusText || 'Google OAuth request failed.';
  throw new Error(`GOOGLE_OAUTH_TOKEN_ERROR:${details}`);
}

async function fetchGoogleProfileEmail(accessToken: string) {
  const response = await fetch(GOOGLE_USERINFO_ENDPOINT, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    return undefined;
  }

  const payload = (await response.json()) as {
    email?: string;
  };

  return payload.email?.trim() || undefined;
}

async function requestGoogleToken(params: URLSearchParams) {
  const response = await fetch(GOOGLE_OAUTH_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    await parseGoogleTokenError(response);
  }

  const payload = (await response.json()) as GoogleTokenResponsePayload;

  if (!payload.access_token) {
    throw new Error('GOOGLE_OAUTH_ACCESS_TOKEN_MISSING');
  }

  const connectedEmail = await fetchGoogleProfileEmail(payload.access_token);

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token || undefined,
    tokenType: payload.token_type || undefined,
    scope: payload.scope || undefined,
    expiresIn: typeof payload.expires_in === 'number' ? payload.expires_in : undefined,
    connectedEmail,
  } satisfies GoogleOAuthTokenResult;
}

export async function exchangeGoogleCalendarCode(params: {
  code: string;
  redirectUri: string;
  codeVerifier: string;
}) {
  const { clientId, clientSecret } = getGoogleOAuthClientConfig();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code: params.code,
    code_verifier: params.codeVerifier,
    redirect_uri: params.redirectUri,
    grant_type: 'authorization_code',
  });

  return requestGoogleToken(body);
}

export async function refreshGoogleCalendarAccessToken(params: {
  refreshToken: string;
}) {
  const { clientId, clientSecret } = getGoogleOAuthClientConfig();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: params.refreshToken,
    grant_type: 'refresh_token',
  });

  return requestGoogleToken(body);
}
