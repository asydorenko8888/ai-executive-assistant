import {
  buildGoogleAndroidOAuthRedirectScheme,
  GOOGLE_CALENDAR_ANDROID_PACKAGE_NAME,
} from '@/src/features/agent/calendar/googleCalendarAndroidOAuthConfig';

export function resolveGoogleCalendarAndroidOAuthScheme(androidClientId: string) {
  return buildGoogleAndroidOAuthRedirectScheme(androidClientId);
}

export function buildGoogleCalendarAndroidIntentFilters(androidClientId: string) {
  const scheme = resolveGoogleCalendarAndroidOAuthScheme(androidClientId);

  if (!scheme) {
    return [];
  }

  return [
    {
      action: 'VIEW',
      data: [
        {
          scheme,
          path: '/oauth2redirect',
        },
      ],
      category: ['BROWSABLE', 'DEFAULT'],
    },
  ];
}

export { GOOGLE_CALENDAR_ANDROID_PACKAGE_NAME };
