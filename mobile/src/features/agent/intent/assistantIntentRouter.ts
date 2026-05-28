export type AssistantIntentClass =
  | 'operational'
  | 'clarification'
  | 'conversational'
  | 'emotional'
  | 'reflective';

export type OperationalIntentSubtype =
  | 'calendar_write'
  | 'scheduling'
  | 'reminder'
  | 'message_draft'
  | 'search'
  | 'planning'
  | 'generic';

import { isOperationalCalendarWriteRequest } from '@/src/features/agent/intent/operationalCalendarWriteDetection';

export type AssistantIntentAnalysis = {
  primary: AssistantIntentClass;
  operationalSubtype: OperationalIntentSubtype | null;
  scores: Record<AssistantIntentClass, number>;
  actionConfidence: number;
  conversationalConfidence: number;
  shouldBypassEmotionalRouting: boolean;
  hasHardOperationalIntent: boolean;
};

/** Explicit verbs — emotional / situational calendar routing is always disabled. */
const HARD_OPERATIONAL_VERB_PATTERN =
  /\b(?:add|create|move|send|schedule|remind|insert|update|book|set up|setup|cancel|delete|remove|reschedule|shift|draft|write|put)\b/i;

const HARD_CALENDAR_WRITE_PATTERN =
  /\b(?:add|create|move|insert|update|put|schedule|book).{0,80}\b(?:google\s+)?calendar\b/i;

const HARD_CALENDAR_WRITE_PATTERN_ALT =
  /\b(?:google\s+)?calendar\b.{0,50}\b(?:add|create|move|insert|update|put|schedule)\b/i;

const OPERATIONAL_VERB_PATTERNS: { pattern: RegExp; weight: number; subtype?: OperationalIntentSubtype }[] = [
  { pattern: /\b(?:add|put|create|book|set up|setup|insert)\b/i, weight: 0.34, subtype: 'calendar_write' },
  { pattern: /\b(?:update)\b/i, weight: 0.32, subtype: 'calendar_write' },
  { pattern: /\b(?:move|reschedule|shift|push|cancel|delete|remove)\b/i, weight: 0.36, subtype: 'calendar_write' },
  { pattern: /\b(?:schedule|slot|block(?:\s+off)?)\b/i, weight: 0.3, subtype: 'scheduling' },
  { pattern: /\b(?:remind|reminder|нагадай|напомни)\b/i, weight: 0.38, subtype: 'reminder' },
  { pattern: /\b(?:send|draft|write|text|sms|email|message)\b/i, weight: 0.32, subtype: 'message_draft' },
  { pattern: /\b(?:call|dial|ring)\b/i, weight: 0.28, subtype: 'message_draft' },
  { pattern: /\b(?:search|find|look up|who is)\b/i, weight: 0.26, subtype: 'search' },
  { pattern: /\b(?:plan|organize|prioriti[sz]e|prep(?:are)?)\b/i, weight: 0.22, subtype: 'planning' },
];

const OPERATIONAL_PHRASE_PATTERNS: { pattern: RegExp; weight: number; subtype: OperationalIntentSubtype }[] = [
  {
    pattern: /\b(?:add|put|create|move|insert|update).{0,80}\b(?:google\s+)?calendar\b/i,
    weight: 0.42,
    subtype: 'calendar_write',
  },
  {
    pattern: /\b(?:google\s+)?calendar\b.{0,50}\b(?:for\s+)?(?:tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|завтра|сьогодні|сегодня)\b/i,
    weight: 0.38,
    subtype: 'calendar_write',
  },
  {
    pattern: /\b(?:meeting|event|зустріч|встреч).{0,40}\b(?:tomorrow|at\s+\d|о\s+\d|завтра)\b/i,
    weight: 0.3,
    subtype: 'scheduling',
  },
  {
    pattern: /\b(?:meeting|event).{0,20}\b(?:google\s+)?calendar\b/i,
    weight: 0.36,
    subtype: 'calendar_write',
  },
  {
    pattern: /\balready\s+moved\b.{0,80}\b(?:add|put|calendar)\b/i,
    weight: 0.45,
    subtype: 'calendar_write',
  },
  {
    pattern: /\b(?:prepared|ready)\s+message\b/i,
    weight: 0.28,
    subtype: 'message_draft',
  },
];

const CLARIFICATION_PATTERNS = [
  /\b(?:what do you mean|which one|can you clarify|уточни|уточните|какой именно)\b/i,
  /\?\s*$/,
];

const EMOTIONAL_PATTERNS = [
  { pattern: /\b(?:relax|breathe|calm|quiet|peaceful|выдох|розслаб|спокойн)\b/i, weight: 0.22 },
  { pattern: /\b(?:stressed|anxious|worried|overwhelmed|тривож|пережива|устал)\b/i, weight: 0.28 },
  { pattern: /\b(?:feel(?:ing)?|felt|emotion|mood|настроен)\b/i, weight: 0.2 },
];

const REFLECTIVE_PATTERNS = [
  /\b(?:think(?:ing)? about|wondering|maybe i should|reflect|думаю|размышл)\b/i,
];

const CONVERSATIONAL_PATTERNS = [
  /\b(?:how are you|what do you think|tell me about|thanks|thank you|дякую|спасибо)\b/i,
];

function clampScore(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function detectHardOperationalIntent(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized) {
    return false;
  }

  if (isOperationalCalendarWriteRequest(normalized)) {
    return true;
  }

  return (
    HARD_OPERATIONAL_VERB_PATTERN.test(normalized) &&
    (/\b(?:calendar|meeting|event|remind|message|sms|email|schedule|зустріч|календар|встреч)\b/i.test(
      normalized,
    ) ||
      HARD_CALENDAR_WRITE_PATTERN.test(normalized) ||
      HARD_CALENDAR_WRITE_PATTERN_ALT.test(normalized))
  );
}

function scoreOperational(transcript: string) {
  let score = 0;
  let subtype: OperationalIntentSubtype | null = null;
  let subtypeWeight = 0;

  for (const entry of OPERATIONAL_VERB_PATTERNS) {
    if (entry.pattern.test(transcript)) {
      score += entry.weight;

      if (entry.subtype && entry.weight >= subtypeWeight) {
        subtype = entry.subtype;
        subtypeWeight = entry.weight;
      }
    }
  }

  for (const entry of OPERATIONAL_PHRASE_PATTERNS) {
    if (entry.pattern.test(transcript)) {
      score += entry.weight;

      if (entry.weight >= subtypeWeight) {
        subtype = entry.subtype;
        subtypeWeight = entry.weight;
      }
    }
  }

  return {
    score: clampScore(score),
    subtype,
  };
}

export function classifyAssistantIntent(transcript: string): AssistantIntentAnalysis {
  const normalized = transcript.trim();

  const scores: Record<AssistantIntentClass, number> = {
    operational: 0,
    clarification: 0,
    conversational: 0,
    emotional: 0,
    reflective: 0,
  };

  if (!normalized) {
    return {
      primary: 'conversational',
      operationalSubtype: null,
      scores,
      actionConfidence: 0,
      conversationalConfidence: 0.2,
      shouldBypassEmotionalRouting: false,
      hasHardOperationalIntent: false,
    };
  }

  const calendarWriteRequest = isOperationalCalendarWriteRequest(normalized);
  const hasHardOperationalIntent = detectHardOperationalIntent(normalized);
  const operational = scoreOperational(normalized);
  scores.operational =
    calendarWriteRequest || hasHardOperationalIntent ? 1 : operational.score;

  if (CLARIFICATION_PATTERNS.some((pattern) => pattern.test(normalized))) {
    scores.clarification = clampScore(scores.clarification + 0.35);
  }

  for (const entry of EMOTIONAL_PATTERNS) {
    if (entry.pattern.test(normalized)) {
      scores.emotional = clampScore(scores.emotional + entry.weight);
    }
  }

  for (const pattern of REFLECTIVE_PATTERNS) {
    if (pattern.test(normalized)) {
      scores.reflective = clampScore(scores.reflective + 0.28);
    }
  }

  for (const pattern of CONVERSATIONAL_PATTERNS) {
    if (pattern.test(normalized)) {
      scores.conversational = clampScore(scores.conversational + 0.3);
    }
  }

  if (scores.operational < 0.2) {
    scores.conversational = clampScore(scores.conversational + 0.12);
  }

  const ranked = (Object.entries(scores) as [AssistantIntentClass, number][]).sort(
    (left, right) => right[1] - left[1],
  );
  const primary = ranked[0]?.[0] ?? 'conversational';
  const actionConfidence = scores.operational;
  const conversationalConfidence = clampScore(
    scores.conversational + scores.emotional + scores.reflective,
  );
  const shouldBypassEmotionalRouting =
    calendarWriteRequest ||
    hasHardOperationalIntent ||
    (actionConfidence >= 0.34 && actionConfidence >= conversationalConfidence + 0.08);

  return {
    primary,
    operationalSubtype: operational.subtype,
    scores,
    actionConfidence,
    conversationalConfidence,
    shouldBypassEmotionalRouting,
    hasHardOperationalIntent,
  };
}

export function shouldSuppressConversationalCalendarRouting(transcript: string) {
  return classifyAssistantIntent(transcript).shouldBypassEmotionalRouting;
}

export function buildIntentPrioritySystemPrompt(analysis: AssistantIntentAnalysis): string | null {
  if (analysis.hasHardOperationalIntent || analysis.shouldBypassEmotionalRouting) {
    const subtype = analysis.operationalSubtype ?? 'generic';

    return [
      `Intent priority (internal): operational / ${subtype}. Hard operational intent detected — emotional and relaxing replies are disabled for this turn.`,
      'Respond in this order: (1) acknowledge the specific action in plain language, (2) execute, confirm a draft, or say what is still needed (calendar link, time, contact, title) using soft ops language, (3) optional one short human line after — never open with relaxation or mood commentary.',
      'Do NOT repeat phrasing from your previous assistant message in this thread. Produce a fresh operational answer for this new user request.',
      'Never ignore explicit verbs: add, create, move, send, remind, schedule, insert, update, call, write, plan.',
    ].join(' ');
  }

  if (analysis.primary !== 'operational') {
    if (analysis.conversationalConfidence > analysis.actionConfidence + 0.15) {
      return 'Intent priority: conversational or emotional thread — respond naturally, but if the user also asked for an action, handle the action first in one line before any warmth.';
    }

    return null;
  }

  const subtype = analysis.operationalSubtype ?? 'generic';

  return [
    `Intent priority (internal): operational / ${subtype}. Action confidence ${analysis.actionConfidence.toFixed(2)} beats conversational ${analysis.conversationalConfidence.toFixed(2)}.`,
    'Respond in this order: (1) acknowledge the specific action in plain language, (2) execute, confirm a draft, or say what is still needed, (3) optional one short human line after.',
    'Do NOT repeat your previous assistant reply verbatim — answer this new request directly.',
  ].join(' ');
}

export function logAssistantIntentRouting(transcript: string, analysis: AssistantIntentAnalysis) {
  console.log('[IntentRouter]', {
    preview: transcript.slice(0, 100),
    primary: analysis.primary,
    operationalSubtype: analysis.operationalSubtype,
    actionConfidence: analysis.actionConfidence,
    conversationalConfidence: analysis.conversationalConfidence,
    hardOperational: analysis.hasHardOperationalIntent,
    bypassEmotional: analysis.shouldBypassEmotionalRouting,
    scores: analysis.scores,
  });
}
