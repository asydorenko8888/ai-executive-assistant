import * as WebBrowser from 'expo-web-browser';

import {
  completeGoogleCalendarNativeOAuthRedirect,
  type GoogleCalendarOAuthRedirectCallbackParams,
} from '@/src/features/agent/calendar/googleCalendarAuth';
import { parseGoogleCalendarOAuthRedirectCallbackUrl } from '@/src/features/agent/calendar/googleCalendarOAuthRedirectUrlParser';
import { restoreGoogleCalendarPkceAuthStore } from '@/src/features/agent/calendar/googleCalendarPkceAuthStore';

export function urlContainsGoogleCalendarOAuthRedirect(url: string) {
  const normalized = url.toLowerCase();

  return (
    normalized.includes('oauth2redirect') ||
    normalized.includes('oauthredirect') ||
    normalized.includes('com.googleusercontent.apps.')
  );
}

export function pathnameContainsGoogleCalendarOAuthRedirect(pathname: string) {
  const normalized = pathname.toLowerCase();

  return normalized.includes('oauth2redirect') || normalized.includes('oauthredirect');
}

export function readGoogleCalendarOAuthRedirectParamsFromUrl(
  url: string,
): GoogleCalendarOAuthRedirectCallbackParams {
  return parseGoogleCalendarOAuthRedirectCallbackUrl(url).oauthParams;
}

export function buildGoogleCalendarOAuthRedirectCallbackUrl(
  params: GoogleCalendarOAuthRedirectCallbackParams,
) {
  const query = new URLSearchParams();

  if (params.code) {
    query.set('code', params.code);
  }

  if (params.state) {
    query.set('state', params.state);
  }

  if (params.error) {
    query.set('error', params.error);
  }

  return `oauthredirect://callback?${query.toString()}`;
}

export async function handleGoogleCalendarOAuthRedirectFromUrl(url: string) {
  console.log('[GoogleCalendar OAuth] callback handler invoked', { url });

  WebBrowser.maybeCompleteAuthSession();

  const parsed = parseGoogleCalendarOAuthRedirectCallbackUrl(url);
  const oauthParams = parsed.oauthParams;

  if (!oauthParams.code && !oauthParams.error) {
    console.log('OAUTH_CALLBACK_MISSING_CODE', url);
    return {
      success: false,
      errorMessage: 'Google OAuth redirect did not return an authorization code.',
    };
  }

  const restoredPkce = await restoreGoogleCalendarPkceAuthStore();

  return completeGoogleCalendarNativeOAuthRedirect(oauthParams, restoredPkce);
}
