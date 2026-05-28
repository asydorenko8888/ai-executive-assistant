export const CALENDAR_EVENTS_WRITE_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
export const CALENDAR_FULL_SCOPE = 'https://www.googleapis.com/auth/calendar';

export const GOOGLE_CALENDAR_WRITE_NOT_GRANTED_MESSAGE =
  'Google Calendar write permission was not granted.';

export const DEFAULT_GOOGLE_CALENDAR_SCOPES = [CALENDAR_EVENTS_WRITE_SCOPE, CALENDAR_FULL_SCOPE] as const;

export function scopesIncludeCalendarEventsWrite(scopes: string[]) {
  const joined = scopes.join(' ').toLowerCase();

  return joined.includes(CALENDAR_EVENTS_WRITE_SCOPE.toLowerCase());
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
