import { fetchAuthoritativeCalendarEventById } from '@/src/features/agent/calendar/calendarAuthoritativeMutationFetch';
import type { CalendarDisambiguationCandidate } from '@/src/features/agent/calendar/calendarEventDisambiguation';

/**
 * Refreshes stored delete candidates from Google Calendar so selection uses current local start times
 * (e.g. after a move from 5 PM → 6 PM).
 */
export async function refreshPendingDeleteCandidates(
  candidates: CalendarDisambiguationCandidate[],
): Promise<CalendarDisambiguationCandidate[]> {
  const refreshed = await Promise.all(
    candidates.map(async (candidate) => {
      const live = await fetchAuthoritativeCalendarEventById(candidate.eventId);

      if (!live?.startsAt) {
        return candidate;
      }

      return {
        ...candidate,
        title: live.summary?.trim() || candidate.title,
        startsAt: live.startsAt,
        endsAt: live.endsAt ?? candidate.endsAt,
      };
    }),
  );

  return refreshed;
}
