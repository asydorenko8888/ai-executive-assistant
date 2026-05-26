import Constants from 'expo-constants';

import { parseAppEnv } from '@/src/shared/config/env.schema';

const runtimeEnvSource = (Constants.expoConfig?.extra?.env ?? {}) as Record<string, unknown>;
const parsedEnv = parseAppEnv(runtimeEnvSource);

export const env = {
  appEnvironment: parsedEnv.APP_ENV,
  appName: parsedEnv.EXPO_PUBLIC_APP_NAME,
  apiBaseUrl: parsedEnv.EXPO_PUBLIC_API_BASE_URL.replace(/\/$/, ''),
  openAiBaseUrl: parsedEnv.EXPO_PUBLIC_OPENAI_BASE_URL.replace(/\/$/, ''),
  openAiApiKey: parsedEnv.EXPO_PUBLIC_OPENAI_API_KEY,
  enableRealtime: parsedEnv.EXPO_PUBLIC_ENABLE_REALTIME,
  requestTimeoutMs: parsedEnv.EXPO_PUBLIC_REQUEST_TIMEOUT_MS,
} as const;

export type AppEnvironment = typeof env;
