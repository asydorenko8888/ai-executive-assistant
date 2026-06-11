const REFRESH_LOCK_TIMEOUT_MS = 30_000;

let inFlightRefresh: Promise<unknown> | null = null;
let refreshStartedAtMs: number | null = null;

export function isCalendarSnapshotRefreshInProgress(nowMs = Date.now()) {
  if (!inFlightRefresh || refreshStartedAtMs === null) {
    return false;
  }

  if (nowMs - refreshStartedAtMs > REFRESH_LOCK_TIMEOUT_MS) {
    console.log('[CALENDAR REFRESH LOCK] stale refresh cleared', {
      ageMs: nowMs - refreshStartedAtMs,
    });
    inFlightRefresh = null;
    refreshStartedAtMs = null;
    return false;
  }

  return true;
}

export async function runDedupedCalendarSnapshotRefresh<T>(
  reason: string,
  task: () => Promise<T>,
): Promise<T> {
  if (inFlightRefresh) {
    console.log('[CALENDAR REFRESH LOCK] reusing in-flight refresh', { reason });
    return inFlightRefresh as Promise<T>;
  }

  console.log('[CALENDAR REFRESH LOCK] starting refresh', { reason });
  refreshStartedAtMs = Date.now();

  inFlightRefresh = task()
    .then((result) => {
      console.log('[CALENDAR REFRESH LOCK] refresh succeeded', { reason });
      return result;
    })
    .catch((error) => {
      console.log('[CALENDAR REFRESH LOCK] refresh failed', { reason, error });
      throw error;
    })
    .finally(() => {
      inFlightRefresh = null;
      refreshStartedAtMs = null;
    });

  return inFlightRefresh as Promise<T>;
}

export async function waitForCalendarSnapshotRefresh(): Promise<void> {
  if (!inFlightRefresh) {
    return;
  }

  console.log('[CALENDAR REFRESH LOCK] waiting for in-flight refresh');
  await inFlightRefresh.catch(() => undefined);
}

export function resetCalendarSnapshotRefreshLock(reason: string) {
  inFlightRefresh = null;
  refreshStartedAtMs = null;
  console.log('[CALENDAR REFRESH LOCK] reset', { reason });
}
