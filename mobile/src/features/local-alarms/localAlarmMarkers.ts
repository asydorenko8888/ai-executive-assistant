export function logLocalAlarmCreated(params: {
  id: string;
  title: string;
  triggerAt: string;
}) {
  console.error('LOCAL_ALARM_CREATED', {
    id: params.id,
    title: params.title,
    triggerAt: params.triggerAt,
  });
}

export function logLocalAlarmDueCheck(params: { count: number }) {
  console.log('LOCAL_ALARM_DUE_CHECK', { count: params.count });
}

export function logLocalAlarmTriggered(params: { id: string; title: string }) {
  console.error('LOCAL_ALARM_TRIGGERED', {
    id: params.id,
    title: params.title,
  });
}

export function logLocalAlarmVoicePlay(params: { id: string; title: string }) {
  console.error('LOCAL_ALARM_VOICE_PLAY', {
    id: params.id,
    title: params.title,
  });
}

export function logLocalAlarmVoiceBlocked(params: { reason: string }) {
  console.error('LOCAL_ALARM_VOICE_BLOCKED', {
    reason: params.reason,
  });
}

export function logLocalAlarmEngineStarted() {
  console.error('LOCAL_ALARM_ENGINE_STARTED');
}

export function logLocalAlarmConfirmationBuilt(params: {
  requestedDelayMs: number | null;
  replyText: string;
}) {
  console.error('LOCAL_ALARM_CONFIRMATION_BUILT', {
    requestedDelayMs: params.requestedDelayMs,
    replyText: params.replyText,
  });
}

export function logAlarmStarted(params: { id: string; title: string }) {
  console.error('ALARM_STARTED', {
    id: params.id,
    title: params.title,
  });
}

export function logAlarmRepeat(params: { id: string; title: string }) {
  console.error('ALARM_REPEAT', {
    id: params.id,
    title: params.title,
  });
}

export function logAlarmStopped(params: { id: string; title: string }) {
  console.error('ALARM_STOPPED', {
    id: params.id,
    title: params.title,
  });
}

export function logAlarmSnoozed(params: {
  id: string;
  title: string;
  snoozeMinutes: number;
}) {
  console.error('ALARM_SNOOZED', {
    id: params.id,
    title: params.title,
    snoozeMinutes: params.snoozeMinutes,
  });
}

export function logAlarmVoiceSelected(params: {
  id: string;
  snoozeCount: number;
  voiceText: string;
}) {
  console.error('ALARM_VOICE_SELECTED', {
    id: params.id,
    snoozeCount: params.snoozeCount,
    voiceText: params.voiceText,
  });
}

export function logAlarmSnoozeCountIncremented(params: {
  id: string;
  snoozeCount: number;
}) {
  console.error('ALARM_SNOOZE_COUNT_INCREMENTED', {
    id: params.id,
    snoozeCount: params.snoozeCount,
  });
}

export function logAlarmVoiceLocalized(params: {
  language: string;
  snoozeCount: number;
  voiceText: string;
}) {
  console.error('ALARM_VOICE_LOCALIZED', {
    language: params.language,
    snoozeCount: params.snoozeCount,
    voiceText: params.voiceText,
  });
}

export function logAlarmPermissionStatus(params: {
  platform: string;
  notifications: string;
  exactAlarm: string;
}) {
  console.error('ALARM_PERMISSION_STATUS', params);
}

export function logAlarmScheduledExact(params: {
  id: string;
  triggerAt: string;
  triggerAtMs: number;
  channelId: string;
  platform?: string;
  exactAlarmTarget?: boolean;
}) {
  console.error('ALARM_SCHEDULED_EXACT', params);
}

export function logAlarmNotificationFired(params: { id: string; title: string }) {
  console.error('ALARM_NOTIFICATION_FIRED', params);
}

export function logAlarmSoundPlayRequested(params: { id: string; title: string }) {
  console.error('ALARM_SOUND_PLAY_REQUESTED', {
    id: params.id,
    title: params.title,
  });
}
