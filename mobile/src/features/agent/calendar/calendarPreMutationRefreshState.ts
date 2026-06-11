let calendarMutationRefreshRequired = false;

export function markCalendarMutationRefreshRequired(reason: string) {
  calendarMutationRefreshRequired = true;
  console.log('[CALENDAR PRE-MUTATION REFRESH] refresh required', { reason });
}

export function resetCalendarMutationRefreshRequirement(reason: string) {
  calendarMutationRefreshRequired = false;
  console.log('[CALENDAR PRE-MUTATION REFRESH] requirement cleared', { reason });
}

export function isCalendarMutationRefreshRequired() {
  return calendarMutationRefreshRequired;
}
