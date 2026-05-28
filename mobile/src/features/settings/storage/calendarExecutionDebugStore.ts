import { getStoredJson, setStoredJson } from '@/src/shared/storage';

const DEBUG_STORAGE_KEY = 'executive-ai.calendar-execution-debug.v1';

export type CalendarExecutionDebugSnapshot = {
  lastToolStatus: 'SUCCESS' | 'FAILURE' | 'PENDING' | null;
  lastErrorCode: string | null;
  lastApiError: string | null;
  lastEventId: string | null;
  updatedAt: string | null;
};

const EMPTY: CalendarExecutionDebugSnapshot = {
  lastToolStatus: null,
  lastErrorCode: null,
  lastApiError: null,
  lastEventId: null,
  updatedAt: null,
};

export async function loadCalendarExecutionDebug() {
  return getStoredJson<CalendarExecutionDebugSnapshot>(DEBUG_STORAGE_KEY, EMPTY);
}

export async function saveCalendarExecutionDebug(snapshot: CalendarExecutionDebugSnapshot) {
  await setStoredJson(DEBUG_STORAGE_KEY, snapshot);
}

export function recordCalendarExecutionDebug(tool: {
  status: 'SUCCESS' | 'FAILURE' | 'PENDING';
  errorCode?: string;
  error?: string;
  eventId?: string;
}) {
  const snapshot: CalendarExecutionDebugSnapshot = {
    lastToolStatus: tool.status,
    lastErrorCode: tool.errorCode ?? null,
    lastApiError: tool.error ?? null,
    lastEventId: tool.eventId ?? null,
    updatedAt: new Date().toISOString(),
  };

  void saveCalendarExecutionDebug(snapshot);

  console.log('[CalendarExecutionDebug]', snapshot);

  return snapshot;
}
