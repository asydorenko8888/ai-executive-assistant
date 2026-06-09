export function assertGoogleCalendarPkceCodeVerifier(
  codeVerifier: string | undefined | null,
) {
  const normalized = codeVerifier?.trim();

  if (!normalized) {
    throw new Error(
      'Google Calendar PKCE code verifier is missing. Connect again from Home.',
    );
  }

  return normalized;
}

export function parseGoogleTokenErrorPayload(payload: {
  error?: string;
  error_description?: string;
}) {
  return payload.error_description?.trim() || payload.error?.trim() || null;
}

export function buildGooglePkceTokenExchangeBody(params: {
  clientId: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}) {
  const codeVerifier = assertGoogleCalendarPkceCodeVerifier(params.codeVerifier);

  return new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: params.clientId,
    code: params.code,
    redirect_uri: params.redirectUri,
    code_verifier: codeVerifier,
  });
}
