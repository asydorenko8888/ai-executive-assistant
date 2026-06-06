import type { CalendarUpdateEventPayload } from '@/src/features/agent/execution/actionExecutionTypes';
import type { VerifiedCalendarEvent } from '@/src/features/agent/execution/actionExecutionTypes';
import { verifyUpdatedEventMatchesPayload } from '@/src/features/agent/calendar/calendarUpdateVerification';

export const UPDATE_VERIFY_RETRY_DELAYS_MS = [0, 500, 1000, 2000];

export type UpdateVerificationReadAttempt = {
  attemptIndex: number;
  delayMs: number;
  readable: boolean;
  startsAt: string | null;
  endsAt: string | null;
  matchesPayload: boolean;
  mismatch: ReturnType<typeof verifyUpdatedEventMatchesPayload> | null;
  fetchError: string | null;
};

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function verifyUpdateWithRetryReads<T extends VerifiedCalendarEvent>(params: {
  eventId: string;
  payload: CalendarUpdateEventPayload;
  oldStartsAt?: string | null;
  readEvent: () => Promise<T | null>;
  delaysMs?: number[];
  sleepFn?: (ms: number) => Promise<void>;
}): Promise<{
  verified: boolean;
  event: T | null;
  attempts: UpdateVerificationReadAttempt[];
  finalMismatch: ReturnType<typeof verifyUpdatedEventMatchesPayload> | null;
}> {
  const delaysMs = params.delaysMs ?? UPDATE_VERIFY_RETRY_DELAYS_MS;
  const sleepFn = params.sleepFn ?? sleep;
  const attempts: UpdateVerificationReadAttempt[] = [];
  let finalMismatch: ReturnType<typeof verifyUpdatedEventMatchesPayload> | null = null;

  console.log('[Calendar Update Verify Start]', {
    eventId: params.eventId,
    oldStartsAt: params.oldStartsAt ?? null,
    requestedStart: params.payload.start.dateTime,
    requestedEnd: params.payload.end.dateTime,
    retryDelaysMs: delaysMs,
  });

  for (let attemptIndex = 0; attemptIndex < delaysMs.length; attemptIndex += 1) {
    const delayMs = delaysMs[attemptIndex] ?? 0;

    if (delayMs > 0) {
      await sleepFn(delayMs);
    }

    let fetched: T | null = null;
    let fetchError: string | null = null;

    try {
      fetched = await params.readEvent();
    } catch (error) {
      fetchError = error instanceof Error ? error.message : String(error);
    }

    const readable = Boolean(fetched?.startsAt && fetched?.endsAt);
    const mismatch =
      readable && fetched
        ? verifyUpdatedEventMatchesPayload(fetched, params.payload, {
            requestedEventId: params.eventId,
            originalStartsAt: params.oldStartsAt ?? undefined,
          })
        : null;
    const matchesPayload = Boolean(mismatch?.ok);

    if (mismatch && !mismatch.ok) {
      finalMismatch = mismatch;
    }

    const attempt: UpdateVerificationReadAttempt = {
      attemptIndex,
      delayMs,
      readable,
      startsAt: fetched?.startsAt ?? null,
      endsAt: fetched?.endsAt ?? null,
      matchesPayload,
      mismatch,
      fetchError,
    };

    attempts.push(attempt);

    console.log('[Calendar Update Verify Fetch]', {
      eventId: params.eventId,
      attemptIndex,
      delayMs,
      readable,
      startsAt: attempt.startsAt,
      endsAt: attempt.endsAt,
      matchesPayload,
      fetchError,
      mismatch,
    });

    if (matchesPayload && fetched) {
      console.log('[Calendar Update Verified]', {
        eventId: params.eventId,
        attemptIndex,
        delayMs,
        startsAt: fetched.startsAt,
        endsAt: fetched.endsAt,
      });

      return {
        verified: true,
        event: fetched,
        attempts,
        finalMismatch: null,
      };
    }
  }

  console.log('[Calendar Update Verify Failed]', {
    eventId: params.eventId,
    oldStartsAt: params.oldStartsAt ?? null,
    requestedStart: params.payload.start.dateTime,
    requestedEnd: params.payload.end.dateTime,
    attempts: attempts.length,
    finalMismatch,
  });

  return {
    verified: false,
    event: null,
    attempts,
    finalMismatch,
  };
}
