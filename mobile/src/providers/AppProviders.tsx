import type { PropsWithChildren } from 'react';
import { useEffect } from 'react';

import { CalendarReminderEngineHost } from '@/src/features/calendar-reminder-engine';
import { LocalAlarmEngineHost } from '@/src/features/local-alarms';
import { LocalReminderEngineHost } from '@/src/features/local-reminders';
import { useLocalSchedulerBootstrap } from '@/src/features/local-scheduling';
import { QueryProvider } from '@/src/providers/QueryProvider';
import { StoreProvider } from '@/src/providers/StoreProvider';
import { ThemeProvider } from '@/src/providers/ThemeProvider';
import { ensureExecutiveDeviceId } from '@/src/shared/device/executiveDeviceSession';

export function AppProviders({ children }: PropsWithChildren) {
  useLocalSchedulerBootstrap();

  useEffect(() => {
    void ensureExecutiveDeviceId();
  }, []);

  return (
    <StoreProvider>
      <QueryProvider>
        <ThemeProvider>
          {children}
          <CalendarReminderEngineHost />
          <LocalReminderEngineHost />
          <LocalAlarmEngineHost />
        </ThemeProvider>
      </QueryProvider>
    </StoreProvider>
  );
}
