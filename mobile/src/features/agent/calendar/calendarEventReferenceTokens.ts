import { isTemporalOnlyTitle } from '@/src/features/agent/calendar/calendarTemporalWords';

/** Pronouns and deictic references — never valid calendar title queries. */
export const EVENT_PRONOUN_REFERENCE =
  /(?:^|[\s,.;:!?—-])(?:его|её|ее|его\s+событ(?:ие|ия)?|её\s+событ(?:ие|ия)?|ее\s+событ(?:ие|ия)?|их|її|їх|його|його\s+под(?:ію|ія)?|неї|нею|цю|цей|це|это|той|та|те|тому|тій|эту|этот|этого|этой|тот(?:\s+сам(?:ый|а|у|ое|і))?)(?=[\s,.;:!?—-]|$)|\b(?:it|this|that|them|him|her)\b|(?:эту\s+встречу|эту\s+запись|эту\s+задачу|это\s+событие|цю\s+подію|цю\s+зустріч|this\s+event|that\s+event|the\s+event)/iu;

const PRONOUN_TOKEN =
  /^(?:его|её|ее|его\s+событ(?:ие|ия)?|её\s+событ(?:ие|ия)?|ее\s+событ(?:ие|ия)?|их|її|їх|його|його\s+под(?:ію|ія)?|неї|нею|цю|цей|це|это|той|та|те|эту|этот|тот(?:\s+сам(?:ый|а|у|ое|і))?|it|this|that|them|him|her|this\s+event|that\s+event|the\s+event)$/iu;

/** Prepositions left after schedule stripping — not event titles. */
const PREPOSITION_ONLY_TITLE = /^(?:на|в|о|с|з|к|до|from|to|at|in)$/iu;

export function transcriptHasEventPronounReference(transcript: string) {
  return EVENT_PRONOUN_REFERENCE.test(transcript.trim());
}

export function isEventPronounReference(text: string) {
  const normalized = text.trim();

  if (!normalized) {
    return false;
  }

  if (PRONOUN_TOKEN.test(normalized)) {
    return true;
  }

  return EVENT_PRONOUN_REFERENCE.test(normalized);
}

export function isIgnorableTitleQueryForMemory(titleQuery: string) {
  const normalized = titleQuery.trim();

  if (!normalized) {
    return true;
  }

  return (
    isEventPronounReference(normalized) ||
    isTemporalOnlyTitle(normalized) ||
    PREPOSITION_ONLY_TITLE.test(normalized)
  );
}

/**
 * Calendar list search runs only when the user named an event.
 * Pronoun-only follow-ups use conversation memory (pending → referenced → modified → created).
 */
export function resolveEventTitleQueryForMemory(params: {
  extractedTitle?: string | null;
  memoryTitle?: string | null;
}) {
  const extracted = params.extractedTitle?.trim() ?? '';

  if (extracted && !isIgnorableTitleQueryForMemory(extracted)) {
    return extracted;
  }

  return params.memoryTitle?.trim() ?? '';
}
