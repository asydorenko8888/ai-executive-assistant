export type LocalAlarmQueryVariant = 'time' | 'list' | 'next' | 'existence' | 'wake';

function normalizeQueryText(transcript: string) {
  return transcript.trim().replace(/[.!?]+$/g, '');
}

function containsAlarmKeyword(transcript: string) {
  const normalized = normalizeQueryText(transcript);

  if (!normalized) {
    return false;
  }

  return /(?:^|[\s,.;:!?—\-«»"'(]+)(?:будильник(?:и|а|у|ом|і|ів|ами)?|alarm(?:s)?)(?:[\s,.;:!?—\-»"'()]+|$)/iu.test(
    normalized,
  );
}

function containsWakeDomain(transcript: string) {
  return /\b(?:разбуди(?:ть)?(?:\s+меня)?|розбуди(?:ти)?(?:\s+мене)?|wake\s+me(?:\s+up)?)\b/iu.test(
    normalizeQueryText(transcript),
  );
}

function matchesExistenceQuery(text: string) {
  return /do\s+i\s+have(?:\s+any)?\s+alarms?/iu.test(text)
    || /есть\s+ли(?:\s+у\s+меня)?\s+будильник/iu.test(text)
    || /чи\s+є(?:\s+у\s+мене)?\s+будильник/iu.test(text);
}

function matchesNextAlarmQuery(text: string) {
  return /what\s+is\s+my\s+next\s+alarm/iu.test(text)
    || /\bnext\s+alarm\b/iu.test(text)
    || /(?:когда|коли)\s+(?:следующ(?:ий|ем)|наступн(?:ий|ого))\s+будильник/iu.test(text)
    || /(?:следующ(?:ий|ем)|наступн(?:ий|ого))\s+будильник/iu.test(text);
}

function matchesActiveAlarmsQuery(text: string) {
  return /show\s+active\s+alarms?/iu.test(text)
    || /\bactive\s+alarms?\b/iu.test(text)
    || /(?:какие|які)\s+будильник(?:и)?\s+активн/iu.test(text)
    || /активн(?:ые|і)\s+будильник(?:и)?/iu.test(text)
    || /будильник(?:и)?\s+активн/iu.test(text);
}

function matchesListAlarmsQuery(text: string) {
  return /what\s+alarms?\s+do\s+i\s+have/iu.test(text)
    || /list\s+my\s+alarms?/iu.test(text)
    || /\bmy\s+alarms\b/iu.test(text)
    || /какие\s+(?:у\s+меня\s+)?будильник/iu.test(text)
    || /мои\s+будильники/iu.test(text)
    || /мої\s+будильники/iu.test(text)
    || /які\s+(?:у\s+мене\s+)?будильник/iu.test(text);
}

function matchesTimeAlarmQuery(text: string) {
  return /what\s+time\s+is\s+(?:my\s+)?alarm(?:\s+set\s+for)?/iu.test(text)
    || /when\s+is\s+my\s+alarm/iu.test(text)
    || /when\s+will\s+(?:my\s+)?alarm\s+ring/iu.test(text)
    || /на\s*(?:который\s+час|сколько|скільки)/iu.test(text)
    || /насколько\s+(?:у\s+меня\s+)?/iu.test(text)
    || /на\s+какое\s+время\s+поставлен/iu.test(text)
    || /на\s+котру\s+годину/iu.test(text)
    || /какие\s+будильники\s+стоят/iu.test(text)
    || /будильник\s+стоит/iu.test(text);
}

function matchesWakeTimeQuery(text: string) {
  return /when\s+do\s+i\s+need\s+to\s+wake\s+up/iu.test(text)
    || /when\s+should\s+i\s+wake\s+up/iu.test(text)
    || /when\s+do\s+i\s+have\s+to\s+get\s+up/iu.test(text)
    || /когда\s+мне\s+вставать/iu.test(text)
    || /когда\s+меня\s+разбуд(?:ишь|ите)/iu.test(text)
    || /коли\s+мен(?:і\s+вставати|е\s+розбудити)/iu.test(text);
}

function isAlarmQueryDomain(transcript: string) {
  const normalized = normalizeQueryText(transcript);

  if (!normalized) {
    return false;
  }

  return (
    containsAlarmKeyword(normalized) ||
    containsWakeDomain(normalized) ||
    matchesWakeTimeQuery(normalized) ||
    matchesNextAlarmQuery(normalized) ||
    matchesActiveAlarmsQuery(normalized) ||
    matchesListAlarmsQuery(normalized) ||
    matchesTimeAlarmQuery(normalized) ||
    matchesExistenceQuery(normalized)
  );
}

export function classifyLocalAlarmQueryVariant(transcript: string): LocalAlarmQueryVariant | null {
  const normalized = normalizeQueryText(transcript);

  if (!normalized || !isAlarmQueryDomain(normalized)) {
    return null;
  }

  if (matchesExistenceQuery(normalized)) {
    return 'existence';
  }

  if (matchesNextAlarmQuery(normalized)) {
    return 'next';
  }

  if (matchesActiveAlarmsQuery(normalized) || matchesListAlarmsQuery(normalized)) {
    return 'list';
  }

  if (matchesWakeTimeQuery(normalized)) {
    return 'wake';
  }

  if (matchesTimeAlarmQuery(normalized) || (/\?$/.test(transcript.trim()) && containsAlarmKeyword(normalized))) {
    return 'time';
  }

  if (/\?$/.test(transcript.trim())) {
    return 'time';
  }

  return null;
}

export function isLocalAlarmQueryTranscript(transcript: string) {
  return classifyLocalAlarmQueryVariant(transcript) !== null;
}
