import {
  buildGoogleAndroidOAuthRedirectScheme,
  buildGoogleAndroidOAuthRedirectUri,
  GOOGLE_CALENDAR_ANDROID_PACKAGE_NAME,
} from '@/src/features/agent/calendar/googleCalendarAndroidOAuthConfig';
import { env } from '@/src/shared/config';

export {
  buildGoogleAndroidOAuthRedirectScheme,
  buildGoogleAndroidOAuthRedirectUri,
  GOOGLE_CALENDAR_ANDROID_PACKAGE_NAME,
  parseGoogleAndroidOAuthClientIdSuffix,
} from '@/src/features/agent/calendar/googleCalendarAndroidOAuthConfig';

export function resolveGoogleCalendarAndroidOAuthClientId() {
  return env.googleCalendarAndroidClientId.trim();
}

export function resolveGoogleCalendarAndroidOAuthRedirectUri() {
  const androidClientId = resolveGoogleCalendarAndroidOAuthClientId();

  if (!androidClientId) {
    return '';
  }

  return buildGoogleAndroidOAuthRedirectUri(androidClientId);
}

export function logGoogleCalendarAndroidOAuthSetup(platform = 'android') {
  const androidClientId = resolveGoogleCalendarAndroidOAuthClientId();
  const redirectUri = resolveGoogleCalendarAndroidOAuthRedirectUri();
  const redirectScheme = buildGoogleAndroidOAuthRedirectScheme(androidClientId);

  console.error('GOOGLE_CALENDAR_ANDROID_OAUTH_SETUP', {
    packageName: GOOGLE_CALENDAR_ANDROID_PACKAGE_NAME,
    platform,
    androidClientId: androidClientId || 'MISSING_SET_EXPO_PUBLIC_GOOGLE_CALENDAR_ANDROID_CLIENT_ID',
    redirectUri: redirectUri || 'MISSING_ANDROID_CLIENT_ID',
    redirectScheme: redirectScheme || 'MISSING_ANDROID_CLIENT_ID',
    oauthClientType: 'android',
    authLibrary: 'expo-auth-session',
    usesExpoProxy: false,
    sha1Command:
      'cd mobile/android && ./gradlew signingReport  (copy SHA1 from Variant: debug)',
    easSha1Command: 'npx eas-cli credentials -p android',
  });
}
