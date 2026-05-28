import type { ChatMessage } from '@/src/entities/chat/types';
import { buildShortTermMemory, buildShortTermMemoryPrompt } from '@/src/features/chat/memory/shortTermMemory';

export type VoiceSessionEmotionalTone = 'worried' | 'hurried' | 'neutral';

export type VoiceSessionState = {
  facts: string[];
  userLocation: string | null;
  emotionalTone: VoiceSessionEmotionalTone | null;
  gymClosed: boolean;
  consideringLunch: boolean;
  timingConcern: boolean;
  meetingCanceled: boolean;
  lastAssistantRecommendation: string | null;
};

export type VoiceSessionContext = {
  rollingSummary: string | null;
  state: VoiceSessionState;
  recentTurns: Array<{ role: 'user' | 'assistant'; content: string }>;
};

export type VoiceSessionMemory = {
  messages: ChatMessage[];
  rollingSummary: string | null;
  state: VoiceSessionState;
  startedAt: string;
  lastTurnAt: string;
};

const MAX_PAYLOAD_MESSAGES = 14;
const SUMMARIZE_AFTER_MESSAGES = 12;
const KEEP_RECENT_MESSAGES = 8;

const LOCATION_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\b(elk grove village|elk grove)\b/i, label: 'Elk Grove Village' },
  { pattern: /\b(arlington(?:\s+heights)?)\b/i, label: 'Arlington' },
  { pattern: /\b(still in|i'?m in|я в|я ще в|находясь в)\s+([^?.!,]+)/i, label: '' },
];

const EMPTY_STATE: VoiceSessionState = {
  facts: [],
  userLocation: null,
  emotionalTone: null,
  gymClosed: false,
  consideringLunch: false,
  timingConcern: false,
  meetingCanceled: false,
  lastAssistantRecommendation: null,
};

function uniqueFacts(facts: string[]) {
  return Array.from(new Set(facts.map((fact) => fact.trim()).filter(Boolean))).slice(0, 12);
}

function extractLocationFromText(text: string) {
  for (const entry of LOCATION_PATTERNS) {
    const match = text.match(entry.pattern);

    if (!match) {
      continue;
    }

    if (entry.label) {
      return entry.label;
    }

    const captured = match[2]?.trim();

    if (captured && captured.length < 40) {
      return captured.replace(/\s+/g, ' ');
    }
  }

  return null;
}

function detectEmotionalTone(text: string): VoiceSessionEmotionalTone | null {
  if (/\b(worried|anxious|stress|panic|тривож|хвилю|пережива|боюся)\b/i.test(text)) {
    return 'worried';
  }

  if (/\b(hurry|rush|barely|tight|встиг|поспіш|щільно|едва)\b/i.test(text)) {
    return 'hurried';
  }

  return null;
}

function extractFactsFromText(text: string, role: 'user' | 'assistant') {
  const facts: string[] = [];
  const normalized = text.trim();

  if (!normalized) {
    return facts;
  }

  if (role === 'user') {
    if (/\b(gym|спортзал).{0,40}(closed|закрит)|\b(closed|закрит).{0,40}(gym|спортзал)/i.test(normalized)) {
      facts.push('Gym is closed');
    }

    if (/\b(hungry|lunch|обід|ланч|пообід|голод)\b/i.test(normalized)) {
      facts.push('User is thinking about lunch');
    }

    if (/\b(cancel(?:led|ed)?|скасован|отмен[её]н)\b/i.test(normalized)) {
      facts.push('A meeting or plan was canceled');
    }

    if (/\b(still have time|make it|встигну|встигаю|do i still)\b/i.test(normalized)) {
      facts.push('User is worried about timing');
    }

    if (/\b(traffic|jam|пробк|затор)\b/i.test(normalized)) {
      facts.push('User is worried about traffic');
    }

    const location = extractLocationFromText(normalized);

    if (location) {
      facts.push(`User is in or around ${location}`);
    }
  }

  if (role === 'assistant' && normalized.length > 0) {
    facts.push(`Assistant last advised: ${normalized.slice(0, 180)}`);
  }

  return facts;
}

export function rebuildVoiceSessionState(
  messages: ChatMessage[],
  rollingSummary: string | null,
): VoiceSessionState {
  const state: VoiceSessionState = { ...EMPTY_STATE, facts: [] };
  const conversationMessages = messages.filter(
    (message) => message.role === 'user' || message.role === 'assistant',
  );

  for (const message of conversationMessages) {
    const text = message.content.trim();

    if (!text) {
      continue;
    }

    if (message.role === 'user') {
      if (/\b(gym|спортзал).{0,40}(closed|закрит)|\b(closed|закрит).{0,40}(gym|спортзал)/i.test(text)) {
        state.gymClosed = true;
      }

      if (/\b(hungry|lunch|обід|ланч|пообід|голод)\b/i.test(text)) {
        state.consideringLunch = true;
      }

      if (/\b(cancel(?:led|ed)?|скасован|отмен[её]н)\b/i.test(text)) {
        state.meetingCanceled = true;
      }

      if (
        /\b(still have time|make it|встигну|встигаю|do i still|how much time|скільки часу|traffic|пробк)\b/i.test(
          text,
        )
      ) {
        state.timingConcern = true;
      }

      const location = extractLocationFromText(text);

      if (location) {
        state.userLocation = location;
      }

      const tone = detectEmotionalTone(text);

      if (tone) {
        state.emotionalTone = tone;
      }

      state.facts.push(...extractFactsFromText(text, 'user'));
    }

    if (message.role === 'assistant') {
      state.lastAssistantRecommendation = text.slice(0, 220);
      state.facts.push(...extractFactsFromText(text, 'assistant'));
    }
  }

  if (rollingSummary) {
    state.facts.unshift(`Session so far: ${rollingSummary}`);
  }

  state.facts = uniqueFacts(state.facts);

  return state;
}

function buildRollingSummary(messages: ChatMessage[]) {
  const olderMessages = messages.slice(0, -KEEP_RECENT_MESSAGES);
  const snapshot = rebuildVoiceSessionState(olderMessages, null);
  const userLines = olderMessages
    .filter((message) => message.role === 'user')
    .map((message) => message.content.trim())
    .filter(Boolean)
    .slice(-4);

  const segments = [
    snapshot.facts.length > 0 ? snapshot.facts.slice(0, 6).join('; ') : null,
    userLines.length > 0 ? `User said earlier: ${userLines.join(' / ')}` : null,
  ].filter(Boolean);

  if (segments.length === 0) {
    return null;
  }

  return segments.join(' ');
}

export function createVoiceSessionMemory(): VoiceSessionMemory {
  const now = new Date().toISOString();

  return {
    messages: [],
    rollingSummary: null,
    state: { ...EMPTY_STATE },
    startedAt: now,
    lastTurnAt: now,
  };
}

export function maybeCompressVoiceSession(memory: VoiceSessionMemory): VoiceSessionMemory {
  if (memory.messages.length <= SUMMARIZE_AFTER_MESSAGES) {
    return memory;
  }

  const rollingSummary = buildRollingSummary(memory.messages);
  const recentMessages = memory.messages.slice(-KEEP_RECENT_MESSAGES);
  const state = rebuildVoiceSessionState(recentMessages, rollingSummary);

  console.log('[Voice Session] compressed', {
    before: memory.messages.length,
    after: recentMessages.length,
    rollingSummary,
  });

  return {
    ...memory,
    messages: recentMessages,
    rollingSummary,
    state,
  };
}

export function appendVoiceSessionUserMessage(
  memory: VoiceSessionMemory,
  userMessage: ChatMessage,
): VoiceSessionMemory {
  const messages = [...memory.messages, userMessage];
  const state = rebuildVoiceSessionState(messages, memory.rollingSummary);

  return {
    ...memory,
    messages,
    state,
    lastTurnAt: new Date().toISOString(),
  };
}

export function appendVoiceSessionAssistantMessage(
  memory: VoiceSessionMemory,
  assistantMessage: ChatMessage,
): VoiceSessionMemory {
  const withMessage: VoiceSessionMemory = {
    ...memory,
    messages: [...memory.messages, assistantMessage],
    lastTurnAt: new Date().toISOString(),
  };

  const compressed = maybeCompressVoiceSession(withMessage);
  const state = rebuildVoiceSessionState(compressed.messages, compressed.rollingSummary);

  return {
    ...compressed,
    state,
  };
}

export function getVoiceSessionMessagesForPayload(memory: VoiceSessionMemory): ChatMessage[] {
  return memory.messages.slice(-MAX_PAYLOAD_MESSAGES);
}

export function buildVoiceSessionContext(memory: VoiceSessionMemory): VoiceSessionContext {
  return {
    rollingSummary: memory.rollingSummary,
    state: memory.state,
    recentTurns: memory.messages
      .filter((message) => message.role === 'user' || message.role === 'assistant')
      .slice(-6)
      .map((message) => ({
        role: message.role as 'user' | 'assistant',
        content: message.content.trim(),
      })),
  };
}

export function buildVoiceSessionSystemPrompt(
  memory: VoiceSessionMemory,
  options?: { suppressEmotionalContinuation?: boolean },
): string | null {
  const { state, rollingSummary, recentTurns } = buildVoiceSessionContext(memory);
  const segments: string[] = [];
  const suppressEmotionalContinuation = options?.suppressEmotionalContinuation ?? false;

  segments.push(
    suppressEmotionalContinuation
      ? 'Live voice session — the user just gave an operational instruction. Answer that action first; do not continue a prior relaxing or emotional thread unless it directly helps the task.'
      : 'Live voice session — this is one ongoing conversation, not isolated Q&A. Build on prior turns, recommendations, and worries already discussed.',
  );

  if (rollingSummary) {
    segments.push(`Earlier in this session: ${rollingSummary}`);
  }

  if (state.facts.length > 0) {
    segments.push(`Session facts to keep in mind: ${state.facts.join('; ')}.`);
  }

  if (state.userLocation) {
    segments.push(`User location signal: ${state.userLocation}.`);
  }

  if (state.emotionalTone) {
    segments.push(`User tone: ${state.emotionalTone}. Stay calm, practical, slightly caring — not robotic.`);
  }

  if (state.lastAssistantRecommendation && !suppressEmotionalContinuation) {
    segments.push(
      `Your previous recommendation in this session: "${state.lastAssistantRecommendation}". Do not contradict it unless the new message changes the situation.`,
    );
  }

  if (recentTurns.length > 0) {
    const transcript = recentTurns
      .map((turn) => `${turn.role === 'user' ? 'User' : 'Assistant'}: ${turn.content}`)
      .join('\n');

    segments.push(`Recent turns:\n${transcript}`);
  }

  const shortTermPrompt = buildShortTermMemoryPrompt(buildShortTermMemory(memory.messages));

  if (shortTermPrompt) {
    segments.push(shortTermPrompt);
  }

  return segments.join('\n\n');
}

export function enrichTranscriptWithSessionContext(
  transcript: string,
  session: VoiceSessionContext | null | undefined,
) {
  if (!session || session.state.facts.length === 0) {
    return transcript;
  }

  const hints = [
    session.state.gymClosed ? 'gym closed earlier in session' : null,
    session.state.consideringLunch ? 'user considering lunch' : null,
    session.state.userLocation ? `user in ${session.state.userLocation}` : null,
    session.state.timingConcern ? 'user worried about timing' : null,
    session.state.meetingCanceled ? 'meeting canceled earlier' : null,
  ].filter(Boolean);

  if (hints.length === 0) {
    return transcript;
  }

  return `${transcript} [Session: ${hints.join('; ')}]`;
}
