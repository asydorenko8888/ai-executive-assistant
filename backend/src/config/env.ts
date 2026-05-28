import 'dotenv/config';

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsedValue = Number(value);

  if (Number.isInteger(parsedValue) && parsedValue > 0) {
    return parsedValue;
  }

  return fallback;
}

export const backendEnv = {
  PORT: parsePositiveInteger(process.env.PORT, 3001),
  OPENAI_API_KEY: process.env.OPENAI_API_KEY?.trim() ?? '',
  OPENAI_MODEL: process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini',
  CORS_ORIGIN: process.env.CORS_ORIGIN?.trim() || 'http://localhost:8081',
  APP_API_KEY: process.env.APP_API_KEY?.trim() ?? '',
  GOOGLE_CALENDAR_WEB_CLIENT_ID: process.env.GOOGLE_CALENDAR_WEB_CLIENT_ID?.trim() ?? '',
  GOOGLE_CALENDAR_WEB_CLIENT_SECRET: process.env.GOOGLE_CALENDAR_WEB_CLIENT_SECRET?.trim() ?? '',
} as const;
