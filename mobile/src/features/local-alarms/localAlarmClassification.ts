import {
  CALENDAR_WORD_EDGE,
  CALENDAR_WORD_END,
} from '@/src/features/agent/calendarIntelligence/calendarTextBoundaries';

const LOCAL_ALARM_VERB = new RegExp(
  `${CALENDAR_WORD_EDGE}(?:постав(?:ь|ьте|ити|\\s+)?\\s*будильник|set\\s+(?:an?\\s+)?alarm|разбуди(?:ть)?(?:\\s+меня)?|розбуди(?:ти)?(?:\\s+мене)?|wake\\s+me(?:\\s+up)?)${CALENDAR_WORD_END}`,
  'iu',
);

const LOCAL_ALARM_LIST = new RegExp(
  `${CALENDAR_WORD_EDGE}(?:какие\\s+у\\s+меня\\s+будильники|мои\\s+будильники|what\\s+alarms?\\s+do\\s+i\\s+have|list\\s+my\\s+alarms?)${CALENDAR_WORD_END}`,
  'iu',
);

const LOCAL_ALARM_CANCEL = new RegExp(
  `${CALENDAR_WORD_EDGE}(?:удали(?:ть)?\\s+будильник|видали(?:ти)?\\s+будильник|отмени(?:ть)?\\s+будильник|cancel\\s+(?:the\\s+)?alarm|delete\\s+(?:the\\s+)?alarm)${CALENDAR_WORD_END}`,
  'iu',
);

const CALENDAR_DOMAIN_IN_ALARM =
  /(?:google\s*)?(?:календар[ьяьюеёим]*|calendar)/iu;

export function isLocalAlarmListQuery(transcript: string) {
  return LOCAL_ALARM_LIST.test(transcript.trim());
}

export function isLocalAlarmCancelQuery(transcript: string) {
  return LOCAL_ALARM_CANCEL.test(transcript.trim());
}

export function isLocalAlarmCreateQuery(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized || CALENDAR_DOMAIN_IN_ALARM.test(normalized)) {
    return false;
  }

  return LOCAL_ALARM_VERB.test(normalized);
}

export function isLocalAlarmIntent(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized) {
    return false;
  }

  return (
    isLocalAlarmListQuery(normalized) ||
    isLocalAlarmCancelQuery(normalized) ||
    isLocalAlarmCreateQuery(normalized)
  );
}
