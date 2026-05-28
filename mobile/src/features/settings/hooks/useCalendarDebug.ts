import { useCallback, useEffect, useState } from 'react';

import {
  fetchGoogleCalendarDebugSnapshot,
  runGoogleCalendarTestInsert,
  type GoogleCalendarDebugSnapshot,
} from '@/src/features/agent/calendar/googleCalendarBackendApi';
import {
  loadCalendarExecutionDebug,
  type CalendarExecutionDebugSnapshot,
} from '@/src/features/settings/storage/calendarExecutionDebugStore';

export function useCalendarDebug() {
  const [snapshot, setSnapshot] = useState<GoogleCalendarDebugSnapshot | null>(null);
  const [localExecution, setLocalExecution] = useState<CalendarExecutionDebugSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isTestRunning, setIsTestRunning] = useState(false);
  const [lastTestResult, setLastTestResult] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const [remote, local] = await Promise.all([
        fetchGoogleCalendarDebugSnapshot(),
        loadCalendarExecutionDebug(),
      ]);

      setSnapshot(remote);
      setLocalExecution(local);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load calendar debug snapshot';

      setLoadError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runTestInsert = useCallback(async () => {
    setIsTestRunning(true);
    setLastTestResult(null);

    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const result = await runGoogleCalendarTestInsert(timeZone);

      if (result.status === 'SUCCESS') {
        setLastTestResult(`SUCCESS: eventId=${result.eventId ?? 'unknown'}`);
      } else {
        setLastTestResult(`FAILURE: ${result.code ?? 'UNKNOWN'}: ${result.message ?? 'test insert failed'}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Test insert failed';

      setLastTestResult(`FAILURE: ${message}`);
    } finally {
      setIsTestRunning(false);
      await refresh();
    }
  }, [refresh]);

  return {
    snapshot,
    localExecution,
    isLoading,
    isTestRunning,
    lastTestResult,
    loadError,
    refresh,
    runTestInsert,
  };
}
