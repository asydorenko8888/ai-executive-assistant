import type { QueryClient } from '@tanstack/react-query';

import { invalidateCalendarVisibilityCaches } from '@/src/features/agent/calendar/calendarAgendaRefresh';
import { logAgendaRefresh } from '@/src/features/agent/calendar/calendarPipelineLogger';
import { queryKeys } from '@/src/shared/api';

export async function refreshHomeBriefing(queryClient: QueryClient, referenceNow = new Date()) {
  logAgendaRefresh('briefing_refresh_start', {});

  await invalidateCalendarVisibilityCaches(referenceNow);

  await queryClient.refetchQueries({
    queryKey: queryKeys.agent.homePreview(),
  });

  await queryClient.refetchQueries({
    queryKey: queryKeys.agent.briefing(),
  });

  logAgendaRefresh('briefing_refresh_complete', {});
}
