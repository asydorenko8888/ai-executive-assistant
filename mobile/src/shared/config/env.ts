import Constants from 'expo-constants';

import { parseAppEnv } from '@/src/shared/config/env.schema';

const runtimeEnvSource = (Constants.expoConfig?.extra?.env ?? {}) as Record<string, unknown>;
const parsedEnv = parseAppEnv(runtimeEnvSource);

export const env = {
  appEnvironment: parsedEnv.APP_ENV,
  appName: parsedEnv.EXPO_PUBLIC_APP_NAME,
  apiBaseUrl: parsedEnv.EXPO_PUBLIC_API_BASE_URL.replace(/\/$/, ''),
  enableRealtime: parsedEnv.EXPO_PUBLIC_ENABLE_REALTIME,
  requestTimeoutMs: parsedEnv.EXPO_PUBLIC_REQUEST_TIMEOUT_MS,
  googleCalendarEnabled: parsedEnv.EXPO_PUBLIC_GOOGLE_CALENDAR_ENABLED,
  googleCalendarWebClientId: parsedEnv.EXPO_PUBLIC_GOOGLE_CALENDAR_WEB_CLIENT_ID,
  googleCalendarAndroidClientId: parsedEnv.EXPO_PUBLIC_GOOGLE_CALENDAR_ANDROID_CLIENT_ID,
  googleCalendarIosClientId: parsedEnv.EXPO_PUBLIC_GOOGLE_CALENDAR_IOS_CLIENT_ID,
  appApiKey: parsedEnv.EXPO_PUBLIC_APP_API_KEY,
  calendarTimezone: parsedEnv.EXPO_PUBLIC_CALENDAR_TIMEZONE,
} as const;

export type AppEnvironment = typeof env;
