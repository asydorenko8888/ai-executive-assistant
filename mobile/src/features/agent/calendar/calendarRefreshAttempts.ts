const MAX_CALENDAR_REFRESH_ATTEMPTS = 3;

let refreshAttemptCount = 0;

export function resetCalendarRefreshAttempts(reason: string) {
  refreshAttemptCount = 0;
  console.log('[CALENDAR REFRESH] attempts reset');
  console.log(`reason=${reason}`);
}

export function getCalendarRefreshAttemptCount() {
  return refreshAttemptCount;
}

export function incrementCalendarRefreshAttempt() {
  refreshAttemptCount += 1;
  return refreshAttemptCount;
}

export function hasExceededCalendarRefreshAttempts() {
  return refreshAttemptCount >= MAX_CALENDAR_REFRESH_ATTEMPTS;
}

export function getMaxCalendarRefreshAttempts() {
  return MAX_CALENDAR_REFRESH_ATTEMPTS;
}
