const GOOGLE_CALENDAR_ANDROID_PACKAGE = 'com.aiexecutiveassistant.mobile';
const GOOGLE_ANDROID_CLIENT_ID_SUFFIX = '.apps.googleusercontent.com';

function resolveGoogleCalendarAndroidOAuthScheme(androidClientId) {
  const trimmed = String(androidClientId ?? '').trim();

  if (!trimmed.endsWith(GOOGLE_ANDROID_CLIENT_ID_SUFFIX)) {
    return '';
  }

  const clientIdSuffix = trimmed.slice(0, -GOOGLE_ANDROID_CLIENT_ID_SUFFIX.length);
  return `com.googleusercontent.apps.${clientIdSuffix}`;
}

function buildGoogleCalendarAndroidIntentFilters(androidClientId) {
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

module.exports = {
  GOOGLE_CALENDAR_ANDROID_PACKAGE,
  resolveGoogleCalendarAndroidOAuthScheme,
  buildGoogleCalendarAndroidIntentFilters,
};
