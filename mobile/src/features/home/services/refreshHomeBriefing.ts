import type { QueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/src/shared/api';

export async function refreshHomeBriefing(queryClient: QueryClient) {
  await queryClient.invalidateQueries({
    queryKey: queryKeys.agent.homePreview(),
  });

  await queryClient.refetchQueries({
    queryKey: queryKeys.agent.homePreview(),
  });
}
