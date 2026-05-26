import { env } from '@/src/shared/config';
import { request, type HttpMethod, type RequestOptions } from '@/src/shared/api/request';

type RequestConfig<TBody = unknown> = Omit<RequestOptions<TBody>, 'baseUrl' | 'method'>;

type ApiClientConfig = {
  baseUrl: string;
  defaultHeaders?: Record<string, string>;
};

export class ApiClient {
  private readonly baseUrl: string;
  private readonly defaultHeaders: Record<string, string>;

  constructor({ baseUrl, defaultHeaders = {} }: ApiClientConfig) {
    this.baseUrl = baseUrl;
    this.defaultHeaders = defaultHeaders;
  }

  request<TResponse, TBody = unknown>(
    method: HttpMethod,
    config: RequestConfig<TBody>,
  ) {
    return request<TResponse, TBody>({
      ...config,
      method,
      baseUrl: this.baseUrl,
      headers: {
        ...this.defaultHeaders,
        ...config.headers,
      },
    });
  }

  get<TResponse>(config: RequestConfig) {
    return this.request<TResponse>('GET', config);
  }

  post<TResponse, TBody = unknown>(config: RequestConfig<TBody>) {
    return this.request<TResponse, TBody>('POST', config);
  }

  put<TResponse, TBody = unknown>(config: RequestConfig<TBody>) {
    return this.request<TResponse, TBody>('PUT', config);
  }

  patch<TResponse, TBody = unknown>(config: RequestConfig<TBody>) {
    return this.request<TResponse, TBody>('PATCH', config);
  }

  delete<TResponse>(config: RequestConfig) {
    return this.request<TResponse>('DELETE', config);
  }
}

export const apiClient = new ApiClient({
  baseUrl: env.apiBaseUrl,
});
