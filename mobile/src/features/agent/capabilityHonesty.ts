import type { AgentCapabilitySnapshot, ExecutiveAgentSnapshot } from '@/src/features/agent/types';

/** How the assistant should frame an offered or completed action in conversation. */
export type ConversationExecutionState =
  | 'suggested'
  | 'drafted'
  | 'awaiting_user'
  | 'executed'
  | 'failed';

export type CapabilityHonestyContext = {
  capabilities: AgentCapabilitySnapshot;
  calendarConnected: boolean;
};

function describeAvailability(
  label: string,
  availability: AgentCapabilitySnapshot[keyof AgentCapabilitySnapshot],
  connectedOverride?: boolean,
) {
  if (connectedOverride !== undefined) {
    return connectedOverride ? `${label}: connected (read/summarize only — no send)` : `${label}: not connected`;
  }

  if (availability === 'available') {
    return `${label}: available`;
  }

  if (availability === 'not_connected') {
    return `${label}: not connected`;
  }

  return `${label}: not available yet`;
}

export function buildCapabilityHonestySystemPrompt(context: CapabilityHonestyContext): string {
  const lines = [
    describeAvailability('Google Calendar', context.capabilities.calendar, context.calendarConnected),
    describeAvailability('Email', context.capabilities.email),
    describeAvailability('Tasks', context.capabilities.tasks),
    describeAvailability('Reminders', context.capabilities.reminders),
    describeAvailability('Route/travel', context.capabilities.route),
    describeAvailability('Morning briefings', context.capabilities.briefings),
    'Phone calls: not available — you cannot dial, ring, or talk to anyone on the user\'s behalf.',
    'SMS/iMessage/WhatsApp/Telegram send: not available — you cannot message contacts unless the user sends it.',
    'Email send: not available — you cannot send email on the user\'s behalf.',
    'Calendar write: not available in chat/voice — you cannot create, move, or cancel events unless a confirmed in-app action completed this turn.',
    'Client/contact book: not available — you do not have the user\'s contacts unless they provide details in chat.',
  ];

  return [
    'Capability honesty (critical — trusted companion, not a hallucinating operator):',
    `What exists right now: ${lines.join('; ')}.`,
    'Execution states you must keep straight internally: suggested (idea only), drafted (text/plan you wrote for the user), awaiting_user (needs their tap/send/approval), executed (only if a confirmed tool/action completed this turn), failed (tried and could not).',
    'NEVER imply executed unless state is executed. Bad: "I called them", "I told the client", "I moved the meeting", "I sent the message". Good: "I can draft a message", "If you share the number I\'ll prep text you can send", "I can set a reminder to call", "I don\'t have calling capability yet".',
    'Distinguish clearly in natural language: suggestion vs preparation vs intent vs actual execution. Still warm — no "As an AI model", no cold legal disclaimers.',
    'Example tone: "I can\'t call him directly yet… but if you send the number, I\'ll prepare a short message you can send in one tap."',
    'If the user asks you to contact someone: offer draft + reminder, state the limit once in human words, then help with wording.',
  ].join(' ');
}

export function buildCapabilityHonestyContextFromOrchestrator(orchestrator: {
  capabilities: AgentCapabilitySnapshot;
  snapshot: ExecutiveAgentSnapshot;
}) {
  return buildCapabilityHonestySystemPrompt({
    capabilities: orchestrator.capabilities,
    calendarConnected: orchestrator.snapshot.calendarConnection?.status === 'connected',
  });
}

const FALSE_PAST_TENSE_EXECUTION =
  /\b(?:i(?:'ve| have)?|я|мы|я уже|i already)\s+(?:called|texted|messaged|emailed|informed|told|contacted|reached out to|уведомил|позвонил|написал|отправил)\b/i;

/**
 * Soft guard for templated/local replies — logs and does not rewrite LLM prose.
 */
export function warnIfFalseExecutionClaim(text: string, executionState: ConversationExecutionState) {
  if (executionState === 'executed') {
    return;
  }

  if (FALSE_PAST_TENSE_EXECUTION.test(text)) {
    console.warn('[Capability Honesty] Possible false execution claim in reply', {
      executionState,
      preview: text.slice(0, 120),
    });
  }
}
