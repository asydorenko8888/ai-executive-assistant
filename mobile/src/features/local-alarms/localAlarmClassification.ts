import {
  isPronounDeleteOrCancelRequest,
  isPronounMoveRequest,
  resolvePronounTargetDomain,
  shouldBlockLocalAlarmRoutingForContextFollowUp,
  shouldRoutePronounToLocalAlarm,
} from '@/src/features/agent/conversation/activeConversationalReference';
import { isPostActionAcknowledgmentTurn } from '@/src/features/agent/conversation/postActionAcknowledgmentReply';
import {
  CALENDAR_WORD_EDGE,
  CALENDAR_WORD_END,
} from '@/src/features/agent/calendarIntelligence/calendarTextBoundaries';
import {
  classifyLocalAlarmQueryVariant,
  isLocalAlarmQueryTranscript,
} from '@/src/features/local-alarms/localAlarmQueryDetection';

export type { LocalAlarmQueryVariant } from '@/src/features/local-alarms/localAlarmQueryDetection';
export { classifyLocalAlarmQueryVariant, isLocalAlarmQueryTranscript };

export type LocalAlarmIntentKind = 'create' | 'status' | 'move' | 'delete' | 'list';

const LOCAL_ALARM_VERB = new RegExp(
  `${CALENDAR_WORD_EDGE}(?:постав(?:ь|ьте|ити|\\s+)?\\s*будильник|set\\s+(?:an?\\s+)?alarm|разбуди(?:ть)?(?:\\s+меня)?|розбуди(?:ти)?(?:\\s+мене)?|wake\\s+me(?:\\s+up)?)${CALENDAR_WORD_END}`,
  'iu',
);

/** Create only when a schedule phrase follows — not bare mentions in questions. */
const LOCAL_ALARM_CREATE_WITH_TIME =
  /(?:^|[\s,.;:!?—\-«»"'(]+)(?:будильник(?:\s+на)?\s+(?:завтра|сегодня|через|\d)|будильник\s+на\s+\S|alarm\s+(?:(?:at|for|tomorrow|today|in)\s+\S))/iu;

const LOCAL_ALARM_LIST = new RegExp(
  `${CALENDAR_WORD_EDGE}(?:какие\\s+у\\s+меня\\s+будильники|мои\\s+будильники|what\\s+alarms?\\s+do\\s+i\\s+have|list\\s+my\\s+alarms?)${CALENDAR_WORD_END}`,
  'iu',
);

const LOCAL_ALARM_STATUS = new RegExp(
  `${CALENDAR_WORD_EDGE}(?:` +
    `на\\s+сколько\\s+стоит\\s+будильник|` +
    `на\\s+который\\s+час(?:\\s+у\\s+меня)?(?:\\s+стоит)?\\s+будильник|` +
    `на\\s+какое\\s+время\\s+поставлен\\s+будильник|` +
    `когда\\s+меня\\s+разбудишь|` +
    `есть\\s+ли(?:\\s+у\\s+меня)?\\s+будильник|` +
    `какие\\s+будильники\\s+стоят|` +
    `what\\s+time\\s+is\\s+(?:my\\s+)?alarm|` +
    `when\\s+will\\s+you\\s+wake\\s+me|` +
    `do\\s+i\\s+have\\s+an?\\s+alarm` +
    `)${CALENDAR_WORD_END}`,
  'iu',
);

const LOCAL_ALARM_WAKE_DOMAIN =
  /\b(?:разбуди(?:ть)?(?:\s+меня)?|розбуди(?:ти)?(?:\s+мене)?|wake\s+me(?:\s+up)?)\b/iu;

const LOCAL_ALARM_STATUS_SIGNAL =
  /(?:на\s+(?:который\s+час|сколько)|есть\s+ли|когда\s+(?:меня\s+)?(?:разбуд|разбудишь)|какие\s+будильники|what\s+time\s+is|when\s+will\s+you\s+wake|do\s+i\s+have\s+an?\s+alarm)/iu;

const LOCAL_ALARM_DELETE = new RegExp(
  `${CALENDAR_WORD_EDGE}(?:` +
    `удали(?:ть)?\\s+будильник|` +
    `видали(?:ти)?\\s+будильник|` +
    `отмени(?:ть)?\\s+будильник|` +
    `убери(?:ть)?\\s+будильник|` +
    `cancel\\s+(?:the\\s+)?alarm|` +
    `delete\\s+(?:the\\s+)?alarm` +
    `)${CALENDAR_WORD_END}`,
  'iu',
);

const LOCAL_ALARM_MOVE = new RegExp(
  `${CALENDAR_WORD_EDGE}(?:` +
    `перенеси(?:ть)?\\s+будильник|` +
    `перенес(?:и|і)\\s+будильник|` +
    `сдвинь\\s+будильник|` +
    `move\\s+(?:the\\s+)?alarm|` +
    `reschedule\\s+(?:the\\s+)?alarm` +
    `)${CALENDAR_WORD_END}`,
  'iu',
);

const CALENDAR_DOMAIN_IN_ALARM =
  /(?:google\s*)?(?:календар[ьяьюеёим]*|calendar)/iu;

/** Any mention of alarm domain — routes to alarm workflow before calendar. */
export function containsLocalAlarmKeyword(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized) {
    return false;
  }

  return /(?:^|[\s,.;:!?—\-«»"'(]+)(?:будильник(?:и|а|у|ом|і|ів|ами)?|alarm(?:s)?)(?:[\s,.;:!?—\-»"'()]+|$)/iu.test(
    normalized,
  );
}

export function containsLocalAlarmDomain(transcript: string) {
  return containsLocalAlarmKeyword(transcript) || LOCAL_ALARM_WAKE_DOMAIN.test(transcript.trim());
}

export function shouldRouteToLocalAlarmWorkflow(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized) {
    return false;
  }

  if (isPostActionAcknowledgmentTurn({ transcript: normalized })) {
    return false;
  }

  if (shouldBlockLocalAlarmRoutingForContextFollowUp(normalized)) {
    return false;
  }

  return (
    containsLocalAlarmDomain(normalized) ||
    isLocalAlarmIntent(normalized) ||
    isLocalAlarmQueryTranscript(normalized) ||
    shouldRoutePronounToLocalAlarm(normalized)
  );
}

function isLocalAlarmCreatePattern(transcript: string) {
  return LOCAL_ALARM_VERB.test(transcript) || LOCAL_ALARM_CREATE_WITH_TIME.test(transcript);
}

function isLocalAlarmStatusQuestion(transcript: string) {
  const normalized = transcript.trim();

  if (!containsLocalAlarmDomain(normalized)) {
    return false;
  }

  if (
    isLocalAlarmMoveQuery(normalized) ||
    isLocalAlarmDeleteQuery(normalized) ||
    isLocalAlarmCreatePattern(normalized)
  ) {
    return false;
  }

  return isLocalAlarmStatusQuery(normalized) || LOCAL_ALARM_STATUS_SIGNAL.test(normalized);
}

export function isLocalAlarmExistenceQuestion(transcript: string) {
  return /есть\s+ли(?:\s+у\s+меня)?\s+будильник/iu.test(transcript.trim());
}

export function isLocalAlarmListQuery(transcript: string) {
  return LOCAL_ALARM_LIST.test(transcript.trim());
}

export function isLocalAlarmStatusQuery(transcript: string) {
  return LOCAL_ALARM_STATUS.test(transcript.trim());
}

export function isLocalAlarmCancelQuery(transcript: string) {
  return isLocalAlarmDeleteQuery(transcript);
}

export function isLocalAlarmDeleteQuery(transcript: string) {
  const normalized = transcript.trim();

  if (LOCAL_ALARM_DELETE.test(normalized)) {
    return true;
  }

  if (!isPronounDeleteOrCancelRequest(normalized)) {
    return false;
  }

  return resolvePronounTargetDomain(normalized).selectedDomain === 'local_alarm';
}

export function isLocalAlarmRescheduleQuery(transcript: string) {
  return isLocalAlarmMoveQuery(transcript);
}

export function isLocalAlarmMoveQuery(transcript: string) {
  const normalized = transcript.trim();

  if (LOCAL_ALARM_MOVE.test(normalized)) {
    return true;
  }

  if (/^(?:move\s+it|reschedule\s+it)$/iu.test(normalized)) {
    return true;
  }

  if (!isPronounMoveRequest(normalized)) {
    return false;
  }

  return resolvePronounTargetDomain(normalized).selectedDomain === 'local_alarm';
}

export function isLocalAlarmCreateQuery(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized || CALENDAR_DOMAIN_IN_ALARM.test(normalized)) {
    return false;
  }

  if (
    isLocalAlarmStatusQuery(normalized) ||
    LOCAL_ALARM_STATUS_SIGNAL.test(normalized) ||
    isLocalAlarmDeleteQuery(normalized) ||
    isLocalAlarmMoveQuery(normalized) ||
    isLocalAlarmListQuery(normalized)
  ) {
    return false;
  }

  return isLocalAlarmCreatePattern(normalized);
}

export function classifyLocalAlarmIntentKind(transcript: string): LocalAlarmIntentKind | null {
  const normalized = transcript.trim();

  if (!normalized || CALENDAR_DOMAIN_IN_ALARM.test(normalized)) {
    return null;
  }

  if (isLocalAlarmMoveQuery(normalized)) {
    return 'move';
  }

  if (isLocalAlarmDeleteQuery(normalized)) {
    return 'delete';
  }

  const queryVariant = classifyLocalAlarmQueryVariant(normalized);

  if (queryVariant === 'list') {
    return 'list';
  }

  if (queryVariant) {
    return 'status';
  }

  if (isLocalAlarmStatusQuery(normalized) || isLocalAlarmStatusQuestion(normalized)) {
    return 'status';
  }

  if (isLocalAlarmListQuery(normalized)) {
    return 'list';
  }

  if (isLocalAlarmCreateQuery(normalized)) {
    return 'create';
  }

  return null;
}

export function isLocalAlarmIntent(transcript: string) {
  return classifyLocalAlarmIntentKind(transcript) !== null;
}
