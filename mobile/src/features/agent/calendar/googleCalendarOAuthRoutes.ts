export const GOOGLE_CALENDAR_WEB_CALLBACK_PATH = 'google-calendar-callback';

export const GOOGLE_CALENDAR_WEB_CALLBACK_ROUTE =
  `/${GOOGLE_CALENDAR_WEB_CALLBACK_PATH}` as const;

export function isGoogleCalendarOAuthCallbackUrl(pathname: string) {
  const normalized = pathname.replace(/\/+$/, '') || '/';

  return (
    normalized === GOOGLE_CALENDAR_WEB_CALLBACK_ROUTE ||
    normalized.endsWith(`/${GOOGLE_CALENDAR_WEB_CALLBACK_PATH}`)
  );
}

export function readWebBrowserPathname() {
  if (typeof window === 'undefined') {
    return '';
  }

  return window.location.pathname;
}
