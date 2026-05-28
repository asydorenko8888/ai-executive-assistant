import type { CalendarCreateEventPayload } from '@/src/features/agent/execution/actionExecutionTypes';
import { enqueueCalendarCreatePendingAction } from '@/src/features/agent/calendar/googleCalendarBackendApi';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { getStoredJson, setStoredJson } from '@/src/shared/storage';

const LOCAL_PENDING_ACTION_KEY = 'executive-ai.pending-calendar-action.v1';

export type LocalPendingCalendarAction = {
  id: string;
  type: 'calendar.create';
  payload: CalendarCreateEventPayload;
  transcript: string;
  languageCode: VoiceLanguageCode;
  createdAt: string;
};

export async function saveLocalPendingCalendarAction(action: LocalPendingCalendarAction) {
  await setStoredJson(LOCAL_PENDING_ACTION_KEY, action);
  return action;
}

export async function loadLocalPendingCalendarAction() {
  return getStoredJson<LocalPendingCalendarAction | null>(LOCAL_PENDING_ACTION_KEY, null);
}

export async function clearLocalPendingCalendarAction() {
  await setStoredJson(LOCAL_PENDING_ACTION_KEY, null);
}

export async function enqueueCalendarCreateAction(params: {
  payload: CalendarCreateEventPayload;
  transcript: string;
  languageCode: VoiceLanguageCode;
}) {
  const backendAction = await enqueueCalendarCreatePendingAction(params).catch((error) => {
    console.log('[PendingAction] backend enqueue failed — keeping local copy', error);
    return null;
  });

  const localAction: LocalPendingCalendarAction = {
    id: backendAction?.action.id ?? `local-${Date.now()}`,
    type: 'calendar.create',
    payload: params.payload,
    transcript: params.transcript,
    languageCode: params.languageCode,
    createdAt: new Date().toISOString(),
  };

  await saveLocalPendingCalendarAction(localAction);

  console.log('[PendingAction] queued calendar.create', {
    actionId: localAction.id,
  });

  return localAction;
}
