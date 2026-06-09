import { pathnameContainsGoogleCalendarOAuthRedirect } from '@/src/features/agent/calendar/googleCalendarOAuthRedirectHandler';

export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}) {
  if (!pathnameContainsGoogleCalendarOAuthRedirect(path)) {
    return path;
  }

  const queryIndex = path.indexOf('?');
  const query = queryIndex >= 0 ? path.slice(queryIndex) : '';

  return `/oauthredirect${query}`;
}
