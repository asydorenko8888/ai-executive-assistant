function logMarker(marker: string, details: Record<string, unknown>) {
  console.error(marker, details);
}

export function logCalendarUpdateStarted(params: {
  operationKey: string | null;
  retryCount?: number;
  eventId?: string | null;
  source?: string;
}) {
  logMarker('CALENDAR_UPDATE_STARTED', {
    operationKeyPreview: params.operationKey?.slice(0, 160) ?? null,
    retryCount: params.retryCount ?? null,
    eventId: params.eventId ?? null,
    source: params.source ?? null,
  });
}

export function logCalendarUpdateFinished(params: {
  operationKey?: string | null;
  lockAgeMs?: number | null;
  eventId?: string | null;
}) {
  logMarker('CALENDAR_UPDATE_FINISHED', {
    operationKeyPreview: params.operationKey?.slice(0, 160) ?? null,
    lockAgeMs: params.lockAgeMs ?? null,
    eventId: params.eventId ?? null,
  });
}

export function logCalendarUpdateFailed(params: {
  reason: string;
  operationKey?: string | null;
  lockAgeMs?: number | null;
  retryCount?: number | null;
  eventId?: string | null;
}) {
  logMarker('CALENDAR_UPDATE_FAILED', {
    reason: params.reason,
    operationKeyPreview: params.operationKey?.slice(0, 160) ?? null,
    lockAgeMs: params.lockAgeMs ?? null,
    retryCount: params.retryCount ?? null,
    eventId: params.eventId ?? null,
  });
}

export function logCalendarUpdateStateReset(params: {
  reason: string;
  source?: string;
  operationKey?: string | null;
  lockAgeMs?: number | null;
}) {
  logMarker('CALENDAR_UPDATE_STATE_RESET', {
    reason: params.reason,
    source: params.source ?? null,
    operationKeyPreview: params.operationKey?.slice(0, 160) ?? null,
    lockAgeMs: params.lockAgeMs ?? null,
  });
}
