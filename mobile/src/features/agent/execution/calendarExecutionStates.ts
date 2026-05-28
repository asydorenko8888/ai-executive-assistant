/** Strict calendar tool lifecycle — assistant truth follows these states only. */
export type CalendarExecutionState =
  | 'parsing'
  | 'pending_confirmation'
  | 'authenticating'
  | 'creating_event'
  | 'verifying_event'
  | 'success'
  | 'failed';

export type CalendarExecutionFailureReason =
  | 'date_parse_failed'
  | 'calendar_auth_required'
  | 'calendar_not_connected'
  | 'calendar_write_forbidden'
  | 'calendar_api_unavailable'
  | 'calendar_insert_failed'
  | 'calendar_verification_failed'
  | 'calendar_confirmation_timeout'
  | 'calendar_network_error';

export function isCalendarExecutionTerminal(state: CalendarExecutionState) {
  return state === 'success' || state === 'failed';
}

export function mayAssistantClaimCalendarSuccess(state: CalendarExecutionState, verified: boolean) {
  return state === 'success' && verified;
}
