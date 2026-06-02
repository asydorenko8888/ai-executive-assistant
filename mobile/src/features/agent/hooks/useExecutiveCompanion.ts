import { useCallback, useEffect, useMemo, useState } from 'react';

import * as AuthSession from 'expo-auth-session';
import { Platform } from 'react-native';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { AgentActionKind, AgentActionRecord } from '@/src/features/agent/types';
import { executeAgentAction } from '@/src/features/agent/actionExecution';
import {
  connectGoogleCalendarAccount,
  disconnectGoogleCalendarAccount,
  extractGoogleCalendarAuthorizationCode,
  finalizeGoogleCalendarAuthCode,
  getGoogleCalendarClientId,
  getGoogleCalendarRedirectUri,
  GOOGLE_CALENDAR_DISCOVERY_ISSUER,
  GOOGLE_CALENDAR_WRITE_NOT_GRANTED_MESSAGE,
  googleCalendarOAuthScopes,
  isLikelyPopupBlockedError,
  saveGoogleCalendarWebOAuthPendingState,
  startGoogleCalendarWebRedirectFallback,
} from '@/src/features/agent/calendar';
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
  const googleCalendarClientId = getGoogleCalendarClientId();
  const googleCalendarRedirectUri = getGoogleCalendarRedirectUri();
  const googleCalendarDiscovery = AuthSession.useAutoDiscovery(GOOGLE_CALENDAR_DISCOVERY_ISSUER);
  const isGoogleCalendarClientIdLoaded = Boolean(googleCalendarClientId);
  const googleCalendarAuthRequestConfig = useMemo(
    () => ({
      clientId: googleCalendarClientId || 'missing-google-calendar-client-id',
      scopes: [...googleCalendarOAuthScopes],
      redirectUri: googleCalendarRedirectUri,
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
      extraParams: {
        access_type: 'offline',
        include_granted_scopes: 'true',
        prompt: 'consent select_account',
      },
    }),
    [googleCalendarClientId, googleCalendarRedirectUri],
  );
  const [googleCalendarAuthRequest, , promptGoogleCalendarAuthAsync] =
    AuthSession.useAuthRequest(googleCalendarAuthRequestConfig, googleCalendarDiscovery);
  const isGoogleCalendarConnectReady =
    Platform.OS !== 'web' ||
    Boolean(isGoogleCalendarClientIdLoaded && googleCalendarDiscovery && googleCalendarAuthRequest);
  const isPreparingGoogleCalendarConnection =
    Platform.OS === 'web' &&
    isGoogleCalendarClientIdLoaded &&
    (!googleCalendarDiscovery || !googleCalendarAuthRequest);
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
    console.log('[Calendar] Connect clicked');

    if (Platform.OS !== 'web') {
      setIsCalendarSubmitting(true);

      try {
        const result = await connectGoogleCalendarAccount();
        await refreshHomePreview();
        return result;
      } finally {
        setIsCalendarSubmitting(false);
      }
    }

    if (!googleCalendarClientId || !googleCalendarDiscovery || !googleCalendarAuthRequest) {
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
        setIsCalendarSubmitting(false);
        return response;
      }

      const authorizationCode = extractGoogleCalendarAuthorizationCode(response);
      console.log('[Calendar] Authorization code received:', Boolean(authorizationCode));

      if (!authorizationCode || !googleCalendarAuthRequest.codeVerifier) {
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
          return {
            type: 'error' as const,
            error: GOOGLE_CALENDAR_WRITE_NOT_GRANTED_MESSAGE,
          };
        }

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

      setIsCalendarSubmitting(false);
      return null;
    }
  }, [
    googleCalendarDiscovery,
    googleCalendarAuthRequest,
    googleCalendarClientId,
    googleCalendarRedirectUri,
    promptGoogleCalendarAuthAsync,
    refreshHomePreview,
  ]);

  const handleDisconnectGoogleCalendar = useCallback(async () => {
    setIsCalendarSubmitting(true);

    try {
      const result = await disconnectGoogleCalendarAccount();
      await refreshHomePreview();
      return result;
    } finally {
      setIsCalendarSubmitting(false);
    }
  }, [refreshHomePreview]);

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
    isGoogleCalendarConnectReady,
    isPreparingGoogleCalendarConnection,
    handleConnectGoogleCalendar,
    handleDisconnectGoogleCalendar,
    createReminder,
    createTask,
    completeReminder,
    completeTask,
  };
}
