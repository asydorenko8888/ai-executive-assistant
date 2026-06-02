import type { CalendarPendingAction } from '@/src/features/agent/calendar/calendarConversationState';

export type CalendarStoredUpdateTarget = {
  eventId: string;
  title: string;
  originalStartsAt: string;
  originalEndsAt: string;
  requestedStartMs: number;
  requestedEndMs: number;
};

export function resolveStoredUpdateTargetFromPending(
  pending: CalendarPendingAction,
): CalendarStoredUpdateTarget | null {
  if (pending.action !== 'UPDATE_EVENT') {
    return null;
  }

  const eventId = pending.targetEventId ?? pending.updateEventId ?? pending.candidateEventId;
  const title = (pending.targetEventTitle ?? pending.eventTitle).trim();
  const originalStartsAt = pending.originalStart ?? pending.updateFromStartISO ?? null;
  const originalEndsAt = pending.originalEnd ?? pending.updateFromEndISO ?? null;

  const requestedStartMs = pending.requestedNewStart
    ? Date.parse(pending.requestedNewStart)
    : pending.proposedStartMs;
  const requestedEndMs = pending.requestedNewEnd
    ? Date.parse(pending.requestedNewEnd)
    : pending.proposedEndMs;

  if (!eventId || !title || !originalStartsAt || !originalEndsAt) {
    return null;
  }

  if (Number.isNaN(requestedStartMs) || Number.isNaN(requestedEndMs)) {
    return null;
  }

  return {
    eventId,
    title,
    originalStartsAt,
    originalEndsAt,
    requestedStartMs,
    requestedEndMs,
  };
}
