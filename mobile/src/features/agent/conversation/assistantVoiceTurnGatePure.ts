export type VoiceTurnGateInput = {
  reply: string | null;
  route: string;
  operationalStarted: boolean;
  userTranscript: string;
};

export type VoiceTurnGateDecision =
  | { kind: 'local'; reply: string; source: 'pipeline' | 'operational' | 'calendar_blocked' }
  | { kind: 'llm' };

function isOperationalRoute(turn: VoiceTurnGateInput) {
  return (
    turn.operationalStarted ||
    turn.route === 'operational_local' ||
    turn.route === 'clarification_local'
  );
}

/**
 * Pure routing gate: LLM-bound turns intentionally have reply=null.
 * Calendar contract failures apply only when calendar execution is required.
 */
export function resolveVoiceTurnGatePure(params: {
  turn: VoiceTurnGateInput;
  requiresCalendarExecution: boolean;
  operationalFallbackReply: string;
  calendarBlockedReply: string | null;
}): VoiceTurnGateDecision {
  const pipelineReply = params.turn.reply?.trim() || null;

  if (isOperationalRoute(params.turn)) {
    const reply =
      pipelineReply ||
      (params.requiresCalendarExecution ? params.calendarBlockedReply : null) ||
      params.operationalFallbackReply;

    return { kind: 'local', reply, source: 'operational' };
  }

  if (pipelineReply) {
    return { kind: 'local', reply: pipelineReply, source: 'pipeline' };
  }

  if (params.requiresCalendarExecution) {
    const reply =
      params.calendarBlockedReply ??
      params.operationalFallbackReply;

    return { kind: 'local', reply, source: 'calendar_blocked' };
  }

  return { kind: 'llm' };
}
