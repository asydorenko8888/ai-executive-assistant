import type { GoogleCalendarOAuthRedirectCallbackParams } from '@/src/features/agent/calendar/googleCalendarAuth';
import {
  parseGoogleCalendarOAuthRedirectCallbackUrl,
  resolveGoogleCalendarOAuthRedirectCallback,
} from '@/src/features/agent/calendar/googleCalendarOAuthRedirectUrlParser';

export function readGoogleCalendarOAuthRedirectParams(
  searchParams: Record<string, string | string[] | undefined>,
): GoogleCalendarOAuthRedirectCallbackParams {
  const parsed = parseGoogleCalendarOAuthRedirectCallbackUrl(
    buildSyntheticCallbackUrlFromSearchParams(searchParams),
  );

  return parsed.oauthParams;
}

function buildSyntheticCallbackUrlFromSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
) {
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

  const query = new URLSearchParams();

  const code = read('code');
  const state = read('state');
  const error = read('error');

  if (code) {
    query.set('code', code);
  }

  if (state) {
    query.set('state', state);
  }

  if (error) {
    query.set('error', error);
  }

  return `oauthredirect://callback?${query.toString()}`;
}

export async function resolveGoogleCalendarOAuthRedirectParams(
  searchParams: Record<string, string | string[] | undefined>,
): Promise<GoogleCalendarOAuthRedirectCallbackParams> {
  const resolved = await resolveGoogleCalendarOAuthRedirectCallback(searchParams);
  return resolved.oauthParams;
}
