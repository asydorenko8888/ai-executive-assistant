export function logLocalReminderCreated(params: {
  id: string;
  text: string;
  triggerAtIso: string;
  kind: string;
  sourceTranscript: string;
}) {
  console.error('LOCAL_REMINDER_CREATED', {
    id: params.id,
    text: params.text,
    triggerAt: params.triggerAtIso,
    kind: params.kind,
    transcriptPreview: params.sourceTranscript.slice(0, 160),
  });
}

export function logLocalReminderTriggered(params: {
  id: string;
  text: string;
  triggerAtIso: string;
  kind: string;
}) {
  console.error('LOCAL_REMINDER_TRIGGERED', {
    id: params.id,
    title: params.text,
    text: params.text,
    triggerAt: params.triggerAtIso,
    kind: params.kind,
  });
}

export function logLocalReminderCancelled(params: {
  id: string;
  text: string;
  reason: string;
}) {
  console.error('LOCAL_REMINDER_CANCELLED', {
    id: params.id,
    text: params.text,
    reason: params.reason,
  });
}

export function logLocalReminderEngineStarted() {
  console.error('LOCAL_REMINDER_ENGINE_STARTED');
}

export function logLocalReminderDueCheck(params: { count: number }) {
  console.error('LOCAL_REMINDER_DUE_CHECK', { count: params.count });
}

export function logLocalReminderVoicePlay(params: { id: string; title: string }) {
  console.error('LOCAL_REMINDER_VOICE_PLAY', {
    id: params.id,
    title: params.title,
  });
}

export function logLocalReminderVoiceBlocked(params: {
  id: string;
  title: string;
  reason: string;
}) {
  console.error('LOCAL_REMINDER_VOICE_BLOCKED', {
    id: params.id,
    title: params.title,
    reason: params.reason,
  });
}

export function logLocalReminderConfirmationBuilt(params: {
  requestedDelayMs: number | null;
  replyText: string;
}) {
  console.error('LOCAL_REMINDER_CONFIRMATION_BUILT', {
    requestedDelayMs: params.requestedDelayMs,
    replyText: params.replyText,
  });
}
