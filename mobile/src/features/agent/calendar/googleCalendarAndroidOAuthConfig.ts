export const GOOGLE_CALENDAR_ANDROID_PACKAGE_NAME = 'com.aiexecutiveassistant.mobile';

const GOOGLE_ANDROID_CLIENT_ID_SUFFIX = '.apps.googleusercontent.com';

export function parseGoogleAndroidOAuthClientIdSuffix(androidClientId: string) {
  const trimmed = androidClientId.trim();

  if (!trimmed.endsWith(GOOGLE_ANDROID_CLIENT_ID_SUFFIX)) {
    return null;
  }

  return trimmed.slice(0, -GOOGLE_ANDROID_CLIENT_ID_SUFFIX.length);
}

/** Google Android OAuth redirect URI (reverse client-id scheme). */
export function buildGoogleAndroidOAuthRedirectUri(androidClientId: string) {
  const clientIdSuffix = parseGoogleAndroidOAuthClientIdSuffix(androidClientId);

  if (!clientIdSuffix) {
    return '';
  }

  return `com.googleusercontent.apps.${clientIdSuffix}:/oauth2redirect`;
}

export function buildGoogleAndroidOAuthRedirectScheme(androidClientId: string) {
  const clientIdSuffix = parseGoogleAndroidOAuthClientIdSuffix(androidClientId);

  if (!clientIdSuffix) {
    return '';
  }

  return `com.googleusercontent.apps.${clientIdSuffix}`;
}
