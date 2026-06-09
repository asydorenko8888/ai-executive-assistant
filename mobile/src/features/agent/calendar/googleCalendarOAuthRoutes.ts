export const GOOGLE_CALENDAR_WEB_CALLBACK_PATH = 'google-calendar-callback';

export const GOOGLE_CALENDAR_WEB_CALLBACK_ROUTE =
  `/${GOOGLE_CALENDAR_WEB_CALLBACK_PATH}` as const;

export const GOOGLE_CALENDAR_OAUTH_REDIRECT_PATH = 'oauthredirect';

export const GOOGLE_CALENDAR_OAUTH_REDIRECT_ROUTE =
  `/${GOOGLE_CALENDAR_OAUTH_REDIRECT_PATH}` as const;

/** Expo Go AuthSession.makeRedirectUri({ path: 'oauthredirect' }) return path. */
export const GOOGLE_CALENDAR_OAUTH_REDIRECT_LEGACY_ROUTE =
  `/--/${GOOGLE_CALENDAR_OAUTH_REDIRECT_PATH}` as const;

export function isGoogleCalendarOAuthCallbackUrl(pathname: string) {
  const normalized = pathname.replace(/\/+$/, '') || '/';

  return (
    normalized === GOOGLE_CALENDAR_WEB_CALLBACK_ROUTE ||
    normalized.endsWith(`/${GOOGLE_CALENDAR_WEB_CALLBACK_PATH}`)
  );
}

export function isGoogleCalendarOAuthRedirectUrl(pathname: string) {
  const normalized = pathname.replace(/\/+$/, '') || '/';

  return (
    normalized === GOOGLE_CALENDAR_OAUTH_REDIRECT_ROUTE ||
    normalized === GOOGLE_CALENDAR_OAUTH_REDIRECT_LEGACY_ROUTE ||
    normalized.endsWith(`/${GOOGLE_CALENDAR_OAUTH_REDIRECT_PATH}`) ||
    normalized.endsWith(`/--/${GOOGLE_CALENDAR_OAUTH_REDIRECT_PATH}`)
  );
}

export function readWebBrowserPathname() {
  if (typeof window === 'undefined') {
    return '';
  }

  return window.location.pathname;
}
