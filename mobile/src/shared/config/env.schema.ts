import { z } from 'zod';

const defaultAppEnv = {
  APP_ENV: 'development',
  EXPO_PUBLIC_APP_NAME: 'AI Executive Assistant',
  EXPO_PUBLIC_API_BASE_URL: 'https://api.example.com',
  EXPO_PUBLIC_OPENAI_BASE_URL: 'https://api.openai.com/v1',
  EXPO_PUBLIC_OPENAI_API_KEY: '',
  EXPO_PUBLIC_ENABLE_REALTIME: false,
  EXPO_PUBLIC_REQUEST_TIMEOUT_MS: 10000,
} as const;

function normalizeString(value: unknown) {
  if (typeof value !== 'string') {
    return value;
  }

  const normalizedValue = value.trim();
  return normalizedValue === '' ? undefined : normalizedValue;
}

const appEnvironmentFromEnv = z.preprocess((value) => {
  const normalizedValue = normalizeString(value);

  if (normalizedValue === 'staging' || normalizedValue === 'production') {
    return normalizedValue;
  }

  return normalizedValue === 'development' ? normalizedValue : undefined;
}, z.enum(['development', 'staging', 'production']).default(defaultAppEnv.APP_ENV));

const stringFromEnv = (defaultValue: string) =>
  z.preprocess((value) => normalizeString(value), z.string().min(1).default(defaultValue));

const optionalStringFromEnv = (defaultValue = '') =>
  z.preprocess((value) => normalizeString(value), z.string().default(defaultValue));

const urlFromEnv = (defaultValue: string) =>
  z.preprocess((value) => {
    const normalizedValue = normalizeString(value);

    if (typeof normalizedValue !== 'string') {
      return undefined;
    }

    try {
      return new URL(normalizedValue).toString();
    } catch {
      return undefined;
    }
  }, z.string().url().default(defaultValue));

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalizedValue = value.trim().toLowerCase();

    if (normalizedValue === 'true') {
      return true;
    }

    if (normalizedValue === 'false') {
      return false;
    }
  }

  return undefined;
}, z.boolean().default(defaultAppEnv.EXPO_PUBLIC_ENABLE_REALTIME));

const numberFromEnv = z.preprocess((value) => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }

  if (typeof value === 'string') {
    const normalizedValue = value.trim();
    const parsedValue = Number(normalizedValue);

    if (normalizedValue !== '' && Number.isFinite(parsedValue) && parsedValue > 0) {
      return Math.floor(parsedValue);
    }
  }

  return undefined;
}, z.number().int().positive().default(defaultAppEnv.EXPO_PUBLIC_REQUEST_TIMEOUT_MS));

export const appEnvSchema = z.object({
  APP_ENV: appEnvironmentFromEnv,
  EXPO_PUBLIC_APP_NAME: stringFromEnv(defaultAppEnv.EXPO_PUBLIC_APP_NAME),
  EXPO_PUBLIC_API_BASE_URL: urlFromEnv(defaultAppEnv.EXPO_PUBLIC_API_BASE_URL),
  EXPO_PUBLIC_OPENAI_BASE_URL: urlFromEnv(defaultAppEnv.EXPO_PUBLIC_OPENAI_BASE_URL),
  EXPO_PUBLIC_OPENAI_API_KEY: optionalStringFromEnv(defaultAppEnv.EXPO_PUBLIC_OPENAI_API_KEY),
  EXPO_PUBLIC_ENABLE_REALTIME: booleanFromEnv,
  EXPO_PUBLIC_REQUEST_TIMEOUT_MS: numberFromEnv,
});

export type AppEnvSchema = z.infer<typeof appEnvSchema>;

export function parseAppEnv(source: Record<string, unknown>) {
  const result = appEnvSchema.safeParse(source);

  if (result.success) {
    return result.data;
  }

  return appEnvSchema.parse(defaultAppEnv);
}
