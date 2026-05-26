import { ApiClient } from '@/src/shared/api/client';
import { env } from '@/src/shared/config';

export function createOpenAiClient(accessToken: string) {
  return new ApiClient({
    baseUrl: env.openAiBaseUrl,
    defaultHeaders: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}
