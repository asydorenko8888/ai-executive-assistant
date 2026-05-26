export type ApiErrorPayload = {
  code?: string;
  message?: string;
  details?: unknown;
};

type ApiErrorOptions = {
  message: string;
  status: number;
  code?: string;
  details?: unknown;
  retryable?: boolean;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;
  readonly retryable: boolean;

  constructor({ message, status, code, details, retryable = false }: ApiErrorOptions) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryable = retryable;
  }
}

export function toApiError(error: unknown) {
  if (error instanceof ApiError) {
    return error;
  }

  if (error instanceof Error) {
    return new ApiError({
      message: error.message,
      status: 0,
      retryable: false,
    });
  }

  return new ApiError({
    message: 'Unknown API error',
    status: 0,
    details: error,
    retryable: false,
  });
}

export function createApiErrorFromResponse(status: number, payload: ApiErrorPayload | string | null) {
  if (typeof payload === 'string') {
    return new ApiError({
      status,
      message: payload || 'Request failed',
      retryable: status >= 500,
    });
  }

  return new ApiError({
    status,
    message: payload?.message || 'Request failed',
    code: payload?.code,
    details: payload?.details,
    retryable: status >= 500,
  });
}
