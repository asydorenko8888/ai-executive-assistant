import { useEffect } from 'react';

import { hydrateScheduledItemsOnStartup } from '@/src/features/local-scheduling/notificationSchedulerService';

export function useLocalSchedulerBootstrap() {
  useEffect(() => {
    void hydrateScheduledItemsOnStartup();
  }, []);
}
