/** Reminder domain keywords — explicit user naming, not bare pronouns. */
export function containsLocalReminderKeyword(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized) {
    return false;
  }

  return /(?:^|[\s,.;:!?—\-«»"'(]+)(?:напоминани(?:е|я|й|ю|ями)?|нагадуван(?:ня|і|ь|ь)?|reminder(?:s)?)(?:[\s,.;:!?—\-»"'()]+|$)/iu.test(
    normalized,
  );
}
