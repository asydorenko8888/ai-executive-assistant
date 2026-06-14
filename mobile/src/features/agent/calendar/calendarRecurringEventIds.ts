const RECURRING_INSTANCE_ID_PATTERN = /^(.+)_(\d{8}T\d{6}Z?)$/i;

export function isRecurringGoogleCalendarInstanceId(eventId: string) {
  return RECURRING_INSTANCE_ID_PATTERN.test(eventId.trim());
}

export function parseGoogleCalendarRecurringEventId(eventId: string) {
  const trimmed = eventId.trim();
  const match = trimmed.match(RECURRING_INSTANCE_ID_PATTERN);

  if (!match) {
    return {
      isRecurringInstance: false,
      seriesMasterId: trimmed,
      instanceId: trimmed,
    };
  }

  return {
    isRecurringInstance: true,
    seriesMasterId: match[1]!,
    instanceId: trimmed,
  };
}

export function resolveRecurringDeleteTargetEventId(params: {
  eventId: string;
  deleteScope: 'occurrence' | 'series';
}) {
  const parsed = parseGoogleCalendarRecurringEventId(params.eventId);

  if (params.deleteScope === 'series') {
    return parsed.seriesMasterId;
  }

  return parsed.instanceId;
}
