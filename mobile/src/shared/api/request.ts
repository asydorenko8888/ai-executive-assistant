import { env } from '@/src/shared/config';
import {
  ApiError,
  createApiErrorFromResponse,
} from '@/src/shared/api/api-error';

type Primitive = string | number | boolean;
type QueryParams = Record<string, Primitive | null | undefined>;

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type RequestOptions<TBody = unknown> = {
  baseUrl?: string;
  path: string;
  method?: HttpMethod;
  body?: TBody;
  query?: QueryParams;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

function buildUrl(baseUrl: string, path: string, query?: QueryParams) {
  const url = new URL(path.replace(/^\//, ''), `${baseUrl.replace(/\/$/, '')}/`);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) {
        continue;
      }

      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

async function parseResponse(response: Response) {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
  return text || null;
}

export async function request<TResponse, TBody = unknown>({
  baseUrl = env.apiBaseUrl,
  path,
  method = 'GET',
  body,
  query,
  headers,
  signal,
}: RequestOptions<TBody>): Promise<TResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), env.requestTimeoutMs);

  try {
    const response = await fetch(buildUrl(baseUrl, path, query), {
      method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: signal ?? controller.signal,
    });

    const payload = await parseResponse(response);

    if (!response.ok) {
      throw createApiErrorFromResponse(response.status, payload);
    }

    return payload as TResponse;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError({
        message: 'The request timed out',
        status: 408,
        retryable: true,
      });
    }

    throw new ApiError({
      message: error instanceof Error ? error.message : 'Network request failed',
      status: 0,
      details: error,
      retryable: true,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
