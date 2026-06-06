import type { PropsWithChildren } from 'react';
import { useEffect } from 'react';

import { CalendarReminderEngineHost } from '@/src/features/calendar-reminder-engine';
import { LocalReminderEngineHost } from '@/src/features/local-reminders';
import { QueryProvider } from '@/src/providers/QueryProvider';
import { StoreProvider } from '@/src/providers/StoreProvider';
import { ThemeProvider } from '@/src/providers/ThemeProvider';
import { ensureExecutiveDeviceId } from '@/src/shared/device/executiveDeviceSession';

export function AppProviders({ children }: PropsWithChildren) {
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
        </ThemeProvider>
      </QueryProvider>
    </StoreProvider>
  );
}
