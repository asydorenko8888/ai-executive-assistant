import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

import { env } from '@/src/shared/config';

export const GOOGLE_CALENDAR_DISABLED_PREVIEW_MESSAGE =
  'Google Calendar is not available in Expo Go. Use a development build.';

function isGoogleCalendarExpoGoRuntime() {
  if (Platform.OS === 'web') {
    return false;
  }

  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

function hasGoogleCalendarClientConfigured() {
  return Boolean(
    env.googleCalendarWebClientId ||
      env.googleCalendarAndroidClientId ||
      env.googleCalendarIosClientId,
  );
}

/** Enabled in dev client / production native builds; disabled only in Expo Go. */
export function isGoogleCalendarEnabled() {
  if (isGoogleCalendarExpoGoRuntime()) {
    return false;
  }

  if (env.googleCalendarEnabled) {
    return true;
  }

  return hasGoogleCalendarClientConfigured();
}
