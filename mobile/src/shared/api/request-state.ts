import type { ApiError } from '@/src/shared/api/api-error';

export type AsyncStateStatus = 'idle' | 'loading' | 'success' | 'error';

export type AsyncState<TData> = {
  status: AsyncStateStatus;
  data: TData | null;
  error: ApiError | null;
};

export function createIdleState<TData>(): AsyncState<TData> {
  return {
    status: 'idle',
    data: null,
    error: null,
  };
}

export function createLoadingState<TData>(previousData: TData | null = null): AsyncState<TData> {
  return {
    status: 'loading',
    data: previousData,
    error: null,
  };
}

export function createSuccessState<TData>(data: TData): AsyncState<TData> {
  return {
    status: 'success',
    data,
    error: null,
  };
}

export function createErrorState<TData>(error: ApiError, previousData: TData | null = null): AsyncState<TData> {
  return {
    status: 'error',
    data: previousData,
    error,
  };
}
