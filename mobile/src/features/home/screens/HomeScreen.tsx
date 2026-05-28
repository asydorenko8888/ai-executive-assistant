import { useMemo } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';

import { VoiceAssistantButton } from '@/src/components/ui/VoiceAssistantButton';
import { useExecutiveCompanion } from '@/src/features/agent';
import { useHomeVoiceAssistant } from '@/src/features/home/hooks/useHomeVoiceAssistant';
import {
  formatEventsTodayLabel,
  resolveVisibleCalendarAgenda,
} from '@/src/features/home/utils/homeCalendarAgenda';
import { useReminderMonitor } from '@/src/features/reminders/useReminderMonitor';
import { ScreenContainer } from '@/src/shared/ui';
import { useAssistantStore } from '@/src/store/useAssistantStore';
import { spacing } from '@/src/theme';
import { HomeCalendarWidget } from '@/src/widgets/home/HomeCalendarWidget';
import { HomeHeroWidget } from '@/src/widgets/home/HomeHeroWidget';
import { HomeMorningBriefingWidget } from '@/src/widgets/home/HomeMorningBriefingWidget';
import { HomePlannerWidget } from '@/src/widgets/home/HomePlannerWidget';
import { HomeWeatherWidget } from '@/src/widgets/home/HomeWeatherWidget';

export default function HomeScreen() {
  const profile = useAssistantStore((state) => state.profile);
  const homeDashboard = useAssistantStore((state) => state.homeDashboard);
  const {
    voiceStatus,
    statusText,
    displayTranscript,
    assistantResponse,
    isSpeechMuted,
    isSpeechSupported,
    voiceLanguage,
    voiceLanguageLabel,
    isVoiceLanguageDisabled,
    setVoiceLanguage,
    microphoneStream,
    handleMicrophonePress,
    toggleSpeechMute,
  } = useHomeVoiceAssistant();
  const { activeAlerts, dismissAlert } = useReminderMonitor({
    isSpeechMuted,
    languageCode: voiceLanguage,
  });
  const {
    data,
    isLoading,
    isRefreshing,
    refresh,
    calendarConnection,
    isGoogleCalendarConnectReady,
    isPreparingGoogleCalendarConnection,
    handleConnectGoogleCalendar,
    handleDisconnectGoogleCalendar,
    reminderDraft,
    setReminderDraft,
    reminderOffsetMinutes,
    setReminderOffsetMinutes,
    createReminder,
    taskDraft,
    setTaskDraft,
    createTask,
    scheduledReminders,
    reminderHistory,
    openTasks,
    completeReminder,
    completeTask,
    isSubmittingAction,
  } = useExecutiveCompanion();

  const isCalendarConnected = calendarConnection?.status === 'connected';
  const upcomingCalendarEvents = data?.orchestrator.snapshot.upcomingCalendarEvents ?? [];
  const calendarReferenceDate = useMemo(
    () =>
      data?.orchestrator.context.now ? new Date(data.orchestrator.context.now) : new Date(),
    [data?.orchestrator.context.now],
  );

  const visibleCalendarAgenda = useMemo(
    () =>
      resolveVisibleCalendarAgenda({
        isCalendarConnected,
        upcomingEvents: upcomingCalendarEvents,
        demoAgenda: homeDashboard.agenda,
        referenceDate: calendarReferenceDate,
      }),
    [
      calendarReferenceDate,
      homeDashboard.agenda,
      isCalendarConnected,
      upcomingCalendarEvents,
    ],
  );

  const quickStats = useMemo(
    () =>
      homeDashboard.quickStats.map((stat) =>
        stat.id === 'events'
          ? {
              ...stat,
              text: formatEventsTodayLabel(
                visibleCalendarAgenda.visibleCalendarAgendaItems.length,
              ),
            }
          : stat,
      ),
    [homeDashboard.quickStats, visibleCalendarAgenda.visibleCalendarAgendaItems.length],
  );

  return (
    <ScreenContainer scrollable contentContainerStyle={styles.content}>
      <StatusBar style="light" />
      <HomeHeroWidget
        greeting={homeDashboard.greeting}
        firstName={profile.firstName}
        subtitle={homeDashboard.subtitle}
        quickStats={quickStats}
      />

      <VoiceAssistantButton
        onPress={() => {
          void handleMicrophonePress();
        }}
        onToggleMute={toggleSpeechMute}
        label="Voice Assistant"
        hint="Tap to speak · tap again while speaking to interrupt"
        microphoneStream={microphoneStream}
        statusText={statusText}
        transcriptText={displayTranscript || undefined}
        assistantResponseText={assistantResponse || undefined}
        statusType={voiceStatus}
        isSpeechMuted={isSpeechMuted}
        isSpeechSupported={isSpeechSupported}
        voiceLanguage={voiceLanguage}
        voiceLanguageLabel={voiceLanguageLabel}
        onVoiceLanguageChange={(code) => {
          void setVoiceLanguage(code);
        }}
        isVoiceLanguageDisabled={isVoiceLanguageDisabled}
      />

      <HomeMorningBriefingWidget
        summary={data?.assistantSummary ?? null}
        briefing={data?.briefing ?? null}
        isLoading={isLoading}
        isRefreshing={isRefreshing}
        calendarConnection={calendarConnection}
        isCalendarConnectReady={isGoogleCalendarConnectReady}
        isPreparingCalendarConnection={isPreparingGoogleCalendarConnection}
        onRefresh={() => {
          void refresh();
        }}
        onConnectCalendar={handleConnectGoogleCalendar}
        onDisconnectCalendar={handleDisconnectGoogleCalendar}
      />

      <HomePlannerWidget
        reminderDraft={reminderDraft}
        onReminderDraftChange={setReminderDraft}
        reminderOffsetMinutes={reminderOffsetMinutes}
        onReminderOffsetChange={setReminderOffsetMinutes}
        onCreateReminder={createReminder}
        taskDraft={taskDraft}
        onTaskDraftChange={setTaskDraft}
        onCreateTask={createTask}
        reminders={scheduledReminders}
        activeReminderAlerts={activeAlerts}
        onDismissReminderAlert={dismissAlert}
        reminderHistory={reminderHistory}
        tasks={openTasks}
        isSubmitting={isSubmittingAction}
        onCompleteReminder={completeReminder}
        onCompleteTask={completeTask}
      />

      <HomeWeatherWidget weather={homeDashboard.weather} />
      <HomeCalendarWidget agenda={visibleCalendarAgenda.visibleCalendarAgendaItems} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.xl,
  },
});
