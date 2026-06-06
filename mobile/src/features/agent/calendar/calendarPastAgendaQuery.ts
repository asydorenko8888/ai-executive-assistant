const EXPLICIT_PAST_AGENDA_PATTERNS = [
  /\b(?:past\s+events?|completed\s+events?|what\s+already\s+happened|event\s+history)\b/i,
  /(?:завершен|завершені|минувш|прошедш|прошлі|уже\s+(?:было|прошло|закончил|закінчил))/iu,
  /(?:что|що)\s+(?:было|було)\b/iu,
  /(?:покажи|показать|покажіть|show).{0,24}(?:завершен|минул|прошедш|completed)/iu,
  /\b(?:history|истори[яю])\b/iu,
];

/** User explicitly wants past/completed events — not the default today agenda. */
export function isExplicitPastAgendaQuery(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized) {
    return false;
  }

  return EXPLICIT_PAST_AGENDA_PATTERNS.some((pattern) => pattern.test(normalized));
}
