import type { CalendarExecutionState } from '@/src/features/agent/execution/calendarExecutionStates';

export type ExecutionAuditStage =
  | 'request'
  | 'parsed_intent'
  | 'tool_call'
  | 'api_response'
  | 'verification_response'
  | 'truth_state'
  | 'voice_layer';

export function logExecutionAudit(stage: ExecutionAuditStage, details: Record<string, unknown>) {
  console.log(`[CalendarExecutionAudit] ${stage}`, {
    at: new Date().toISOString(),
    ...details,
  });
}

export function logCalendarExecutionStateTransition(params: {
  from: CalendarExecutionState;
  to: CalendarExecutionState;
  tool: string;
  detail?: string;
}) {
  logExecutionAudit('truth_state', {
    from: params.from,
    to: params.to,
    tool: params.tool,
    detail: params.detail ?? null,
  });
}
