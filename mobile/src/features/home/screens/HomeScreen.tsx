import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';

import { VoiceAssistantButton } from '@/src/components/ui/VoiceAssistantButton';
import { ScreenContainer } from '@/src/shared/ui';
import { useAssistantStore } from '@/src/store/useAssistantStore';
import { spacing } from '@/src/theme';
import { HomeCalendarWidget } from '@/src/widgets/home/HomeCalendarWidget';
import { HomeHeroWidget } from '@/src/widgets/home/HomeHeroWidget';
import { HomeWeatherWidget } from '@/src/widgets/home/HomeWeatherWidget';

export default function HomeScreen() {
  const profile = useAssistantStore((state) => state.profile);
  const homeDashboard = useAssistantStore((state) => state.homeDashboard);

  return (
    <ScreenContainer scrollable contentContainerStyle={styles.content}>
      <StatusBar style="light" />
      <HomeHeroWidget
        greeting={homeDashboard.greeting}
        firstName={profile.firstName}
        subtitle={homeDashboard.subtitle}
        quickStats={homeDashboard.quickStats}
      />

      <VoiceAssistantButton
        label="Voice Assistant"
        hint="Tap to brief, schedule, draft, or follow up."
      />

      <HomeWeatherWidget weather={homeDashboard.weather} />
      <HomeCalendarWidget agenda={homeDashboard.agenda} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.xl,
  },
});
