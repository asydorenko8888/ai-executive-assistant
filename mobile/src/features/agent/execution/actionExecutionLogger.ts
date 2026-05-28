import type { ActionExecutionStatus, ActionExecutionTool } from '@/src/features/agent/execution/actionExecutionTypes';

export type ActionExecutionLogStage =
  | 'intent_detected'
  | 'tool_selected'
  | 'payload_generated'
  | 'execution_started'
  | 'execution_result'
  | 'verification_result'
  | 'execution_failed';

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }

  return error;
}

export function logActionExecution(
  stage: ActionExecutionLogStage,
  details: Record<string, unknown>,
) {
  console.log(`[ActionExecution] ${stage}`, details);
}

export function logActionExecutionLifecycle(params: {
  tool: ActionExecutionTool;
  status: ActionExecutionStatus;
  intentPreview?: string;
  extra?: Record<string, unknown>;
}) {
  logActionExecution('execution_result', {
    tool: params.tool,
    status: params.status,
    intentPreview: params.intentPreview?.slice(0, 120),
    ...params.extra,
  });
}

export function logActionExecutionError(stage: ActionExecutionLogStage, error: unknown, extra?: Record<string, unknown>) {
  logActionExecution(stage, {
    ...extra,
    error: serializeError(error),
  });
}
