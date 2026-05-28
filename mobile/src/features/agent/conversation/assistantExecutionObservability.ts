export type AssistantExecutionState =
  | 'conversational'
  | 'planning'
  | 'tool_call'
  | 'tool_success'
  | 'tool_failure'
  | 'emotional_support';

export type ExecutionLogStage =
  | 'intent_detection'
  | 'planner_activation'
  | 'date_parsing'
  | 'calendar_tool'
  | 'planner_failure'
  | 'fallback_activation'
  | 'state_transition';

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return error;
}

export function logExecutionEvent(
  stage: ExecutionLogStage,
  message: string,
  details?: Record<string, unknown>,
) {
  console.log(`[AssistantExecution] ${stage}`, message, details ?? {});
}

export function logExecutionStateTransition(params: {
  from: AssistantExecutionState;
  to: AssistantExecutionState;
  reason: string;
  allowed: boolean;
}) {
  const payload = {
    from: params.from,
    to: params.to,
    reason: params.reason,
    allowed: params.allowed,
  };

  if (!params.allowed) {
    console.error('[AssistantExecution] state_transition BLOCKED', payload);
    return;
  }

  console.log('[AssistantExecution] state_transition', payload);
}

export function assertExecutionTransition(params: {
  from: AssistantExecutionState;
  to: AssistantExecutionState;
  reason: string;
}) {
  const blocked =
    (params.from === 'planning' || params.from === 'tool_call' || params.from === 'tool_failure') &&
    params.to === 'emotional_support';

  logExecutionStateTransition({
    from: params.from,
    to: params.to,
    reason: params.reason,
    allowed: !blocked,
  });

  return !blocked;
}

export function logPlannerFailure(reason: string, error?: unknown) {
  logExecutionEvent('planner_failure', reason, {
    error: error === undefined ? null : serializeError(error),
  });
}

export function logFallbackActivation(reason: string, details?: Record<string, unknown>) {
  logExecutionEvent('fallback_activation', reason, details ?? {});
}

const EMOTIONAL_EMPTY_DAY_PATTERN =
  /(?:Дальше тихо|можно выдохнуть|можеш видихнути|На решту дня спокійно|Rest of today looks clear|You can relax a bit)/iu;

export function isEmotionalEmptyDayFallback(text: string) {
  return EMOTIONAL_EMPTY_DAY_PATTERN.test(text.trim());
}
