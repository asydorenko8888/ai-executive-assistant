export type ActionExecutionStatus = 'pending' | 'executing' | 'success' | 'failed';

export type ActionExecutionTool =
  | 'google_calendar_create_event'
  | 'message_draft'
  | 'reminder_create'
  | 'generic_operational';

export type VerifiedCalendarEvent = {
  id: string;
  summary: string;
  location?: string;
  startsAt: string;
  endsAt: string;
  htmlLink?: string;
};

export type ActionExecutionResult = {
  status: ActionExecutionStatus;
  tool: ActionExecutionTool;
  verified: boolean;
  errorCode?: string;
  errorMessage?: string;
  event?: VerifiedCalendarEvent;
};

export type CalendarCreateEventPayload = {
  summary: string;
  location?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  recurrence?: string[];
};

export type CalendarUpdateEventPayload = {
  summary?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
};
