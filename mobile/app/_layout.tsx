import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { AppProviders } from '@/src/providers/AppProviders';
import { LoadingScreen } from '@/src/shared/ui';

export default function RootLayout() {
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  if (!loaded) {
    return <LoadingScreen />;
  }

  return (
    <AppProviders>
      {/* File-based routes under app/ are auto-registered (including google-calendar-callback). */}
      <Stack screenOptions={{ headerShown: false }} />
      <StatusBar style="light" />
    </AppProviders>
  );
}
