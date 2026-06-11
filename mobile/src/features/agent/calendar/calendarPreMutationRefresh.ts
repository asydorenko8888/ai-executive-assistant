import type { CalendarEvent } from '@/src/entities/calendar/types';
import { augmentEventsWithConversationContext } from '@/src/features/agent/calendar/calendarConversationEventMemory';
import {
  getLastCalendarSnapshot,
  isLocalCalendarStoreFresh,
} from '@/src/features/agent/calendar/calendarConversationStore';
import {
  isCalendarMutationRefreshRequired,
  resetCalendarMutationRefreshRequirement,
} from '@/src/features/agent/calendar/calendarPreMutationRefreshState';
import { syncCalendarSnapshotAfterMutation } from '@/src/features/agent/calendar/calendarSnapshotSync';
import { waitForCalendarSnapshotRefresh } from '@/src/features/agent/calendar/calendarSnapshotRefreshLock';

export {
  isCalendarMutationRefreshRequired,
  markCalendarMutationRefreshRequired,
  resetCalendarMutationRefreshRequirement,
} from '@/src/features/agent/calendar/calendarPreMutationRefreshState';

export function mergeMutationSearchEventsWithLocalStore(fetchedEvents: CalendarEvent[]): CalendarEvent[] {
  return augmentEventsWithConversationContext(fetchedEvents);
}

export async function ensureCalendarFreshBeforeMutation(params: {
  referenceNow: Date;
}): Promise<{ ok: boolean; events: CalendarEvent[] }> {
  await waitForCalendarSnapshotRefresh();

  if (!isCalendarMutationRefreshRequired() && isLocalCalendarStoreFresh()) {
    return { ok: true, events: getLastCalendarSnapshot() };
  }

  const result = await syncCalendarSnapshotAfterMutation({
    referenceNow: params.referenceNow,
    reason: 'post_mutation',
  });

  resetCalendarMutationRefreshRequirement('pre_mutation_refresh_complete');

  return {
    ok: result.ok,
    events: result.events,
  };
}
