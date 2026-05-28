let calendarWriteAvailable = false;

export function isCalendarWriteAvailableInSession() {
  return calendarWriteAvailable;
}

export function markCalendarWriteAvailableInSession() {
  calendarWriteAvailable = true;
}

export function resetCalendarWriteSession() {
  calendarWriteAvailable = false;
}
