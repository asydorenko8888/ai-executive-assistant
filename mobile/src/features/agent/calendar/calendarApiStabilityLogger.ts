export type CalendarApiOperationType = 'read' | 'create' | 'update' | 'delete' | 'search' | 'status' | 'session';

export function logCalendarApiStability(params: {
  operation: CalendarApiOperationType;
  action: string;
  phase: 'start' | 'success' | 'error' | 'retry';
  attempt: number;
  httpStatus?: number | null;
  errorCode?: string | null;
  retryable?: boolean;
  calendarChanged?: boolean;
  message?: string | null;
  authSession?: Record<string, unknown> | null;
}) {
  console.log('[Calendar API]', {
    operation: params.operation,
    action: params.action,
    phase: params.phase,
    attempt: params.attempt,
    httpStatus: params.httpStatus ?? null,
    errorCode: params.errorCode ?? null,
    retryable: params.retryable ?? null,
    calendarChanged: params.calendarChanged ?? false,
    message: params.message?.slice(0, 160) ?? null,
    authSession: params.authSession ?? null,
    at: new Date().toISOString(),
  });
}
