import {
  CALENDAR_WORD_EDGE,
  CALENDAR_WORD_END,
} from '@/src/features/agent/calendarIntelligence/calendarTextBoundaries';

const LOCAL_REMINDER_VERB = new RegExp(
  `${CALENDAR_WORD_EDGE}(?:remind(?:\\s+me)?|reminder|wake\\s+me(?:\\s+up)?|set\\s+(?:an?\\s+)?alarm|нагадай(?:ти)?|напомни(?:ть)?|разбуди(?:ть)?(?:\\s+меня)?|поставь\\s+будильник|постав(?:ь|ити)\\s+будильник)${CALENDAR_WORD_END}`,
  'iu',
);

const LOCAL_REMINDER_LIST = new RegExp(
  `${CALENDAR_WORD_EDGE}(?:какие\\s+у\\s+меня\\s+напоминания|які\\s+у\\s+мене\\s+нагадування|мои\\s+напоминания|мої\\s+нагадування|what\\s+reminders?\\s+do\\s+i\\s+have|list\\s+my\\s+reminders?)${CALENDAR_WORD_END}`,
  'iu',
);

const LOCAL_REMINDER_CANCEL = new RegExp(
  `${CALENDAR_WORD_EDGE}(?:отмени(?:ть)?\\s+напоминание|скасуй(?:ти)?\\s+нагадування|удали(?:ть)?\\s+будильник|видали(?:ти)?\\s+будильник|cancel\\s+(?:the\\s+)?reminder|delete\\s+(?:the\\s+)?alarm)${CALENDAR_WORD_END}`,
  'iu',
);

const CALENDAR_DOMAIN_IN_REMINDER =
  /(?:google\s*)?(?:календар[ьяьюеёим]*|calendar)/iu;

export function isLocalReminderListQuery(transcript: string) {
  return LOCAL_REMINDER_LIST.test(transcript.trim());
}

export function isLocalReminderCancelQuery(transcript: string) {
  return LOCAL_REMINDER_CANCEL.test(transcript.trim());
}

export function isLocalReminderCreateQuery(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized || CALENDAR_DOMAIN_IN_REMINDER.test(normalized)) {
    return false;
  }

  return LOCAL_REMINDER_VERB.test(normalized);
}

export function isLocalReminderIntent(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized) {
    return false;
  }

  return (
    isLocalReminderListQuery(normalized) ||
    isLocalReminderCancelQuery(normalized) ||
    isLocalReminderCreateQuery(normalized)
  );
}
