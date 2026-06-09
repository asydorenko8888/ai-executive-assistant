import { useCallback, useEffect, useMemo, useState } from 'react';

import { Platform } from 'react-native';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { AgentActionKind, AgentActionRecord } from '@/src/features/agent/types';
import { executeAgentAction } from '@/src/features/agent/actionExecution';
import {
  connectGoogleCalendarAccount,
  disconnectGoogleCalendarAccount,
  extractGoogleCalendarAuthorizationCode,
  finalizeGoogleCalendarAuthCode,
  GOOGLE_CALENDAR_WRITE_NOT_GRANTED_MESSAGE,
  isLikelyPopupBlockedError,
  saveGoogleCalendarWebOAuthPendingState,
  startGoogleCalendarWebRedirectFallback,
} from '@/src/features/agent/calendar';
import {
  GOOGLE_CALENDAR_DISABLED_PREVIEW_MESSAGE,
  isGoogleCalendarEnabled,
} from '@/src/features/agent/calendar/googleCalendarFeatureFlag';
import {
  resolveGoogleCalendarConnectReady,
  resolvePreparingGoogleCalendarConnection,
  useGoogleCalendarOAuthSession,
} from '@/src/features/agent/calendar/hooks/useGoogleCalendarOAuthSession';
import {
  logGoogleCalendarOAuthEvent,
  resolveGoogleCalendarOAuthRuntime,
} from '@/src/features/agent/calendar/googleCalendarOAuthEnvironment';
import { loadExecutiveCompanionHomeData } from '@/src/features/agent/services/dailySummaryService';
import { queryKeys } from '@/src/shared/api';

function createActionRecord(
  kind: AgentActionKind,
  title: string,
  description: string,
  input: Record<string, unknown>,
  requiresConfirmation = false,
): AgentActionRecord {
  const timestamp = new Date().toISOString();

  return {
    id: `agent-action-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    title,
    description,
    input,
    status: requiresConfirmation ? 'pending_confirmation' : 'approved',
    requiresConfirmation,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function buildReminderIso(offsetMinutes: number) {
  return new Date(Date.now() + offsetMinutes * 60 * 1000).toISOString();
}

export function useExecutiveCompanion() {
  const queryClient = useQueryClient();
  const [taskDraft, setTaskDraft] = useState('');
  const [reminderDraft, setReminderDraft] = useState('');
  const [reminderOffsetMinutes, setReminderOffsetMinutes] = useState(60);
  const [isCalendarSubmitting, setIsCalendarSubmitting] = useState(false);
  const [calendarConnectError, setCalendarConnectError] = useState<string | null>(null);
  const googleCalendarOAuthEnabled = isGoogleCalendarEnabled();
  const {
    discovery: googleCalendarDiscovery,
    authRequest: googleCalendarAuthRequest,
    promptGoogleCalendarAuthAsync,
    clientId: googleCalendarClientId,
    redirectUri: googleCalendarRedirectUri,
    isClientIdLoaded: isGoogleCalendarClientIdLoaded,
  } = useGoogleCalendarOAuthSession();
  const isGoogleCalendarConnectReady = resolveGoogleCalendarConnectReady({
    enabled: googleCalendarOAuthEnabled,
    isClientIdLoaded: isGoogleCalendarClientIdLoaded,
    discovery: googleCalendarDiscovery,
    authRequest: googleCalendarAuthRequest,
  });
  const isPreparingGoogleCalendarConnection = resolvePreparingGoogleCalendarConnection({
    enabled: googleCalendarOAuthEnabled,
    isClientIdLoaded: isGoogleCalendarClientIdLoaded,
    discovery: googleCalendarDiscovery,
    authRequest: googleCalendarAuthRequest,
  });
  const homePreviewQuery = useQuery({
    queryKey: queryKeys.agent.homePreview(),
    queryFn: loadExecutiveCompanionHomeData,
  });

  const refreshHomePreview = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.agent.homePreview(),
    });
  }, [queryClient]);

  const refreshBriefing = async () => {
    console.log('[Briefing] Refresh clicked');
    await refreshHomePreview();
  };

  useEffect(() => {
    if (Platform.OS !== 'web') {
      return;
    }

    console.log('[Calendar] Web client ID loaded:', isGoogleCalendarClientIdLoaded);
  }, [isGoogleCalendarClientIdLoaded]);

  const actionMutation = useMutation({
    mutationFn: executeAgentAction,
    onSuccess: async () => {
      await refreshHomePreview();
    },
  });

  const handleConnectGoogleCalendar = useCallback(async () => {
    if (!googleCalendarOAuthEnabled) {
      setCalendarConnectError(GOOGLE_CALENDAR_DISABLED_PREVIEW_MESSAGE);
      return {
        success: false,
        errorMessage: GOOGLE_CALENDAR_DISABLED_PREVIEW_MESSAGE,
      };
    }

    logGoogleCalendarOAuthEvent('BUTTON_PRESSED', {
      runtime: resolveGoogleCalendarOAuthRuntime(),
      platform: Platform.OS,
      clientIdLoaded: isGoogleCalendarClientIdLoaded,
      redirectUri: googleCalendarRedirectUri,
    });
    console.log('[Calendar] Connect clicked');
    setCalendarConnectError(null);

    if (Platform.OS !== 'web') {
      setIsCalendarSubmitting(true);

      try {
        const result = await connectGoogleCalendarAccount();
        await refreshHomePreview();

        if (!result.success) {
          setCalendarConnectError(result.errorMessage ?? 'Unable to connect Google Calendar.');
        }

        return result;
      } finally {
        setIsCalendarSubmitting(false);
      }
    }

    if (!googleCalendarClientId) {
      setCalendarConnectError(
        'Google Calendar web client ID is missing. Set EXPO_PUBLIC_GOOGLE_CALENDAR_WEB_CLIENT_ID.',
      );
      return null;
    }

    if (!googleCalendarDiscovery || !googleCalendarAuthRequest) {
      return null;
    }

    setIsCalendarSubmitting(true);

    try {
      if (!googleCalendarAuthRequest.codeVerifier) {
        setIsCalendarSubmitting(false);
        return null;
      }

      saveGoogleCalendarWebOAuthPendingState({
        clientId: googleCalendarClientId,
        redirectUri: googleCalendarRedirectUri,
        codeVerifier: googleCalendarAuthRequest.codeVerifier,
        state: googleCalendarAuthRequest.state,
      });

      console.log('[Calendar] Starting OAuth');
      const response = await promptGoogleCalendarAuthAsync({
        windowFeatures: {
          width: 520,
          height: 720,
        },
      });
      console.log('[Calendar] OAuth response', response);

      if ((response.type === 'locked' || response.type === 'error') && Platform.OS === 'web') {
        return startGoogleCalendarWebRedirectFallback(
          googleCalendarAuthRequest,
          googleCalendarClientId,
          googleCalendarRedirectUri,
        );
      }

      if (response.type !== 'success') {
        const errorMessage =
          response.type === 'dismiss' || response.type === 'cancel'
            ? 'Google Calendar connection was cancelled.'
            : 'Unable to finish Google Calendar sign-in.';

        setCalendarConnectError(errorMessage);
        setIsCalendarSubmitting(false);
        return response;
      }

      const authorizationCode = extractGoogleCalendarAuthorizationCode(response);
      console.log('[Calendar] Authorization code received:', Boolean(authorizationCode));

      if (!authorizationCode || !googleCalendarAuthRequest.codeVerifier) {
        setCalendarConnectError('Google sign-in did not return an authorization code.');
        setIsCalendarSubmitting(false);
        return null;
      }

      try {
        await finalizeGoogleCalendarAuthCode({
          clientId: googleCalendarClientId,
          code: authorizationCode,
          redirectUri: googleCalendarRedirectUri,
          codeVerifier: googleCalendarAuthRequest.codeVerifier,
        });
        console.log('[Calendar] Exchange success');
        await refreshHomePreview();
        return response;
      } catch (exchangeError) {
        console.log('[Calendar] Exchange error', exchangeError);

        if (
          exchangeError instanceof Error &&
          exchangeError.message === GOOGLE_CALENDAR_WRITE_NOT_GRANTED_MESSAGE
        ) {
          setCalendarConnectError(GOOGLE_CALENDAR_WRITE_NOT_GRANTED_MESSAGE);
          return {
            type: 'error' as const,
            error: GOOGLE_CALENDAR_WRITE_NOT_GRANTED_MESSAGE,
          };
        }

        setCalendarConnectError(
          exchangeError instanceof Error
            ? exchangeError.message
            : 'Unable to finish Google Calendar sign-in.',
        );
        throw exchangeError;
      } finally {
        setIsCalendarSubmitting(false);
      }
    } catch (oauthError) {
      console.log('[Calendar] OAuth error', oauthError);

      if (Platform.OS === 'web' && isLikelyPopupBlockedError(oauthError)) {
        return startGoogleCalendarWebRedirectFallback(
          googleCalendarAuthRequest,
          googleCalendarClientId,
          googleCalendarRedirectUri,
        );
      }

      setCalendarConnectError(
        oauthError instanceof Error
          ? oauthError.message
          : 'Unable to start Google Calendar sign-in.',
      );
      setIsCalendarSubmitting(false);
      return null;
    }
  }, [
    googleCalendarOAuthEnabled,
    isGoogleCalendarClientIdLoaded,
    googleCalendarDiscovery,
    googleCalendarAuthRequest,
    googleCalendarClientId,
    googleCalendarRedirectUri,
    promptGoogleCalendarAuthAsync,
    refreshHomePreview,
  ]);

  const handleDisconnectGoogleCalendar = useCallback(async () => {
    if (!googleCalendarOAuthEnabled) {
      return {
        success: false,
        errorMessage: GOOGLE_CALENDAR_DISABLED_PREVIEW_MESSAGE,
      };
    }

    setIsCalendarSubmitting(true);

    try {
      const result = await disconnectGoogleCalendarAccount();
      await refreshHomePreview();
      return result;
    } finally {
      setIsCalendarSubmitting(false);
    }
  }, [googleCalendarOAuthEnabled, refreshHomePreview]);

  const createReminder = async () => {
    const trimmedDraft = reminderDraft.trim();

    if (!trimmedDraft) {
      return;
    }

    await actionMutation.mutateAsync(
      createActionRecord(
        'create_reminder',
        `Reminder: ${trimmedDraft}`,
        'Local reminder created from the companion panel.',
        {
          title: trimmedDraft,
          scheduledFor: buildReminderIso(reminderOffsetMinutes),
          leadTimeMinutes: 15,
        },
      ),
    );
    setReminderDraft('');
  };

  const createTask = async () => {
    const trimmedDraft = taskDraft.trim();

    if (!trimmedDraft) {
      return;
    }

    await actionMutation.mutateAsync(
      createActionRecord(
        'create_task',
        `Task: ${trimmedDraft}`,
        'Local task captured from the companion panel.',
        {
          title: trimmedDraft,
          priority: 'medium',
        },
      ),
    );
    setTaskDraft('');
  };

  const completeReminder = async (reminderId: string, title: string) => {
    await actionMutation.mutateAsync(
      createActionRecord(
        'complete_reminder',
        `Complete reminder: ${title}`,
        'Reminder marked completed by the user.',
        {
          reminderId,
        },
      ),
    );
  };

  const completeTask = async (taskId: string, title: string) => {
    await actionMutation.mutateAsync(
      createActionRecord(
        'complete_task',
        `Complete task: ${title}`,
        'Task marked completed by the user.',
        {
          taskId,
        },
      ),
    );
  };

  const scheduledReminders = useMemo(() => {
    return (
      homePreviewQuery.data?.workspace.reminders
        .filter((reminder) => reminder.status === 'scheduled')
        .sort((left, right) => Date.parse(left.scheduledFor) - Date.parse(right.scheduledFor)) ?? []
    );
  }, [homePreviewQuery.data]);

  const reminderHistory = useMemo(() => {
    return homePreviewQuery.data?.workspace.reminders.filter((reminder) => reminder.status === 'completed') ?? [];
  }, [homePreviewQuery.data]);

  const openTasks = useMemo(() => {
    return homePreviewQuery.data?.workspace.tasks.filter((task) => task.status !== 'done' && task.status !== 'archived') ?? [];
  }, [homePreviewQuery.data]);

  return {
    isLoading: homePreviewQuery.isLoading,
    isRefreshing: homePreviewQuery.isFetching,
    data: homePreviewQuery.data,
    error: homePreviewQuery.error instanceof Error ? homePreviewQuery.error.message : null,
    refresh: refreshBriefing,
    taskDraft,
    setTaskDraft,
    reminderDraft,
    setReminderDraft,
    reminderOffsetMinutes,
    setReminderOffsetMinutes,
    scheduledReminders,
    reminderHistory,
    openTasks,
    calendarConnection: homePreviewQuery.data?.orchestrator.snapshot.calendarConnection ?? null,
    isSubmittingAction: actionMutation.isPending || isCalendarSubmitting,
    isCalendarConnecting: isCalendarSubmitting,
    isGoogleCalendarConnectReady,
    isPreparingGoogleCalendarConnection,
    isGoogleCalendarOAuthEnabled: googleCalendarOAuthEnabled,
    calendarConnectError,
    handleConnectGoogleCalendar,
    handleDisconnectGoogleCalendar,
    createReminder,
    createTask,
    completeReminder,
    completeTask,
  };
}
