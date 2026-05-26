import { QueryClient } from '@tanstack/react-query';

import { ApiError } from '@/src/shared/api/api-error';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      gcTime: 5 * 60 * 1000,
      retry: (failureCount, error) => {
        if (error instanceof ApiError) {
          return error.retryable && failureCount < 2;
        }

        return failureCount < 2;
      },
      refetchOnReconnect: true,
    },
    mutations: {
      retry: false,
    },
  },
});
