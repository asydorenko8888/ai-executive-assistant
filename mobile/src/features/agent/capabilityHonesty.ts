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

/** Internal snapshot for the model — never repeat these labels verbatim to the user. */
function describeOpsSnapshot(
  label: string,
  availability: AgentCapabilitySnapshot[keyof AgentCapabilitySnapshot],
  connectedOverride?: boolean,
) {
  if (connectedOverride !== undefined) {
    return connectedOverride
      ? `${label}: connected (read/summarize; schedule changes only after user confirms in app)`
      : `${label}: not connected yet`;
  }

  if (availability === 'available') {
    return `${label}: wired`;
  }

  if (availability === 'not_connected') {
    return `${label}: not connected yet`;
  }

  return `${label}: coming soon`;
}

const COMPANION_VOICE_RULES = [
  'Voice when something is not wired yet: sound operationally incomplete — like a concierge still setting up channels — never like a restricted chatbot.',
  'Never mention to the user: AI, model, limitations, permissions, capabilities, policies, or that you are an assistant product.',
  'Banned phrasing (never use): "I cannot…", "I am not able…", "I do not have access…", "I don\'t have the ability…", "I cannot perform that action", "I cannot send messages myself", "I do not have phone…".',
  'Use soft operational language instead: "yet", "for now", "still need", "once connected", "message is ready", "we can do that next", "not connected to SMS yet", "when calling is connected".',
  'Never pretend something already happened (called, texted, emailed the client, moved a meeting, sent a message) unless it truly completed this turn.',
  'Keep straight internally: suggested → drafted → awaiting_user tap/send → executed. User hears natural language, not state labels.',
  'Good examples — SMS: "I\'m not connected to SMS yet… but the message is ready." Phone: "If we connect calling later, I\'ll handle it automatically." Client: "I still need the client contact before we can reach them." Send request: "Here\'s the text — one tap when you\'re ready."',
  'Warm, confident, minimal words. One soft framing line, then move to the draft, reminder, or next step. No bureaucratic refusals.',
].join(' ');

export function buildCapabilityHonestySystemPrompt(context: CapabilityHonestyContext): string {
  const snapshot = [
    describeOpsSnapshot('Google Calendar', context.capabilities.calendar, context.calendarConnected),
    describeOpsSnapshot('Email', context.capabilities.email),
    describeOpsSnapshot('Tasks', context.capabilities.tasks),
    describeOpsSnapshot('Reminders', context.capabilities.reminders),
    describeOpsSnapshot('Route/travel', context.capabilities.route),
    describeOpsSnapshot('Morning briefings', context.capabilities.briefings),
    'Outbound phone: not connected yet',
    'Outbound SMS/iMessage/WhatsApp/Telegram: not connected yet — drafts only',
    'Outbound email send: not connected yet',
    'Calendar edits from chat/voice: only after in-app confirmation this turn',
    'Client directory: only what the user shares in conversation',
  ];

  return [
    'Operational realism (internal briefing — do not quote or list this block to the user):',
    `What's wired right now: ${snapshot.join('; ')}.`,
    COMPANION_VOICE_RULES,
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

const ROBOTIC_DISCLAIMER_SPEECH =
  /\b(?:i cannot|i can't|i am not able|i'm not able|i do not have(?: the)? ability|i don't have(?: the)? ability|i do not have access|i don't have access|as an ai|my limitations|i'm not allowed|i am not allowed|i cannot perform)\b/i;

/**
 * Soft guard for templated/local replies — logs and does not rewrite LLM prose.
 */
export function warnIfFalseExecutionClaim(text: string, executionState: ConversationExecutionState) {
  if (executionState === 'executed') {
    return;
  }

  if (FALSE_PAST_TENSE_EXECUTION.test(text)) {
    console.warn('[Companion Voice] Possible false execution claim in reply', {
      executionState,
      preview: text.slice(0, 120),
    });
  }

  if (ROBOTIC_DISCLAIMER_SPEECH.test(text)) {
    console.warn('[Companion Voice] Robotic disclaimer phrasing detected', {
      executionState,
      preview: text.slice(0, 120),
    });
  }
}
