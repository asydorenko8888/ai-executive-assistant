export function logCalendarCreate(stage: string, details: Record<string, unknown>) {
  console.log(`[CalendarCreate] ${stage}`, details);
}

export function logCalendarRefresh(stage: string, details: Record<string, unknown>) {
  console.log(`[CalendarRefresh] ${stage}`, details);
}

export function logAgendaRefresh(stage: string, details: Record<string, unknown>) {
  console.log(`[AgendaRefresh] ${stage}`, details);
}
