import { Stack, useRouter } from 'expo-router';
import { StyleSheet } from 'react-native';

import { ErrorState, ScreenContainer } from '@/src/shared/ui';

export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ title: 'Not Found' }} />
      <ScreenContainer centered contentContainerStyle={styles.content}>
        <ErrorState
          title="Page not found"
          description="The screen you opened does not exist or has already been moved inside the app flow."
          actionLabel="Return to dashboard"
          onActionPress={() => router.replace('/')}
        />
      </ScreenContainer>
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    width: '100%',
  },
});
