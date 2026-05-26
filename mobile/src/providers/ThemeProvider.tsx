import { createContext, useContext, type PropsWithChildren } from 'react';

import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider as NavigationThemeProvider,
  type Theme,
} from '@react-navigation/native';

import { useColorScheme } from '@/src/hooks/useColorScheme';
import { colors, navigationColors } from '@/src/theme';

type AppThemeValue = {
  colorScheme: 'light' | 'dark';
  colors: typeof colors;
  navigationTheme: Theme;
};

const AppThemeContext = createContext<AppThemeValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const preferredScheme = useColorScheme();
  const colorScheme = preferredScheme === 'dark' ? 'dark' : 'light';

  const navigationTheme =
    colorScheme === 'dark'
      ? { ...DarkTheme, colors: navigationColors.dark }
      : { ...DefaultTheme, colors: navigationColors.light };

  return (
    <AppThemeContext.Provider
      value={{
        colorScheme,
        colors,
        navigationTheme,
      }}>
      <NavigationThemeProvider value={navigationTheme}>{children}</NavigationThemeProvider>
    </AppThemeContext.Provider>
  );
}

export function useAppTheme() {
  const value = useContext(AppThemeContext);

  if (!value) {
    throw new Error('useAppTheme must be used within ThemeProvider');
  }

  return value;
}
