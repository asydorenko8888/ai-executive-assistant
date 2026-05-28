export function logCalendarDecision(
  stage:
    | 'writeAvailable'
    | 'writeScope'
    | 'reasonForRefusal'
    | 'createAttemptStarted'
    | 'createAttemptSucceeded',
  details: Record<string, unknown>,
) {
  console.log(`[Calendar Decision] ${stage}`, details);
}
