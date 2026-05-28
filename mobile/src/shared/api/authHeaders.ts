import { env } from '@/src/shared/config';

export function getAppApiKeyHeaders(): Record<string, string> {
  if (!env.appApiKey) {
    return {};
  }

  return {
    'X-App-Key': env.appApiKey,
  };
}
