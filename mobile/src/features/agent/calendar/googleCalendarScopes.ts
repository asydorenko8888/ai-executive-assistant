/** Required for creating/editing events (server verifies this exact scope). */
export const CALENDAR_EVENTS_WRITE_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

/** Full calendar access (read/write). Kept alongside events scope for compatibility. */
export const CALENDAR_FULL_SCOPE = 'https://www.googleapis.com/auth/calendar';

export const GOOGLE_CALENDAR_WRITE_NOT_GRANTED_MESSAGE =
  'Google Calendar write permission was not granted.';

/** Scopes sent on every Google Calendar OAuth authorization request. */
export const googleCalendarOAuthScopes = [
  'openid',
  'profile',
  'email',
  CALENDAR_EVENTS_WRITE_SCOPE,
  CALENDAR_FULL_SCOPE,
] as const;

export function scopesIncludeCalendarEventsWrite(scopes: string[]) {
  const joined = scopes.join(' ').toLowerCase();

  return joined.includes(CALENDAR_EVENTS_WRITE_SCOPE.toLowerCase());
}

export function scopesIncludeCalendarWrite(scopes: string[]) {
  if (scopesIncludeCalendarEventsWrite(scopes)) {
    return true;
  }

  const joined = scopes.join(' ').toLowerCase();

  return joined.includes(CALENDAR_FULL_SCOPE.toLowerCase());
}

export async function fetchAccessTokenScopes(accessToken: string) {
  const response = await fetch(
    `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
  );

  if (!response.ok) {
    throw new Error('GOOGLE_TOKENINFO_FAILED');
  }

  const payload = (await response.json()) as {
    scope?: string;
    scopes?: string[];
    error?: string;
  };

  if (typeof payload.scope === 'string' && payload.scope.trim()) {
    return payload.scope.split(/\s+/).filter(Boolean);
  }

  if (Array.isArray(payload.scopes)) {
    return payload.scopes.filter((scope): scope is string => typeof scope === 'string' && scope.length > 0);
  }

  return [];
}

export async function resolveGrantedScopes(accessToken: string, scopeFromToken?: string | null) {
  if (typeof scopeFromToken === 'string' && scopeFromToken.trim()) {
    const parsed = scopeFromToken.split(/\s+/).filter(Boolean);

    if (parsed.length > 0) {
      return parsed;
    }
  }

  return fetchAccessTokenScopes(accessToken);
}

export async function assertCalendarEventsWriteScopeGranted(accessToken: string, scopeFromToken?: string | null) {
  const scopes = await resolveGrantedScopes(accessToken, scopeFromToken);

  if (!scopesIncludeCalendarEventsWrite(scopes)) {
    throw new Error(GOOGLE_CALENDAR_WRITE_NOT_GRANTED_MESSAGE);
  }

  return scopes;
}
