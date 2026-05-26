import type { PropsWithChildren } from 'react';

import { QueryProvider } from '@/src/providers/QueryProvider';
import { StoreProvider } from '@/src/providers/StoreProvider';
import { ThemeProvider } from '@/src/providers/ThemeProvider';

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <StoreProvider>
      <QueryProvider>
        <ThemeProvider>{children}</ThemeProvider>
      </QueryProvider>
    </StoreProvider>
  );
}
