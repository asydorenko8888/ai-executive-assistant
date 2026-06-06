import {
  CALENDAR_WORD_EDGE,
  CALENDAR_WORD_END,
} from '@/src/features/agent/calendarIntelligence/calendarTextBoundaries';

const TODAY_HINT = new RegExp(
  `${CALENDAR_WORD_EDGE}(?:сьогодні|сегодня|today)${CALENDAR_WORD_END}`,
  'iu',
);

const FREE_WORD =
  /(?:свободен|свободна|свободное|свободный|свободны|свободн|вільний|вільна|вільне|вільн|free|available|availability)/iu;

const FREE_AVAILABILITY_HINT = new RegExp(
  `(?:${FREE_WORD.source}|вільний\\s+час|свободное\\s+время)`,
  'iu',
);

const FREE_TIME_PHRASES = [
  /\bwhen\s+am\s+i\s+free\b/i,
  /\bfree\s+time\s+today\b/i,
  /\bavailability\s+today\b/i,
  /(?:когда|коли).{0,48}(?:свободн(?:ое|ый|ая|ен|ны)?|вільн(?:ий|а|е)?).{0,48}(?:время|час|time)/iu,
  /(?:когда|коли)\s+(?:я|у\s+меня|у\s+мене).{0,32}(?:свободн(?:ое|ый|ая|ен|ны)?|вільн(?:ий|а|е)?)/iu,
  /(?:свободн(?:ое|ый|ая|ен|ны)?|вільн(?:ий|а|е)?).{0,40}(?:время|час|time).{0,32}(?:сегодня|сьогодні|today)/iu,
  /(?:когда|коли)\s+я\s+.{0,24}(?:свободен|свободна|вільний|вільна)/iu,
  /(?:я\s+)?(?:свободен|свободна|вільний|вільна).{0,20}(?:сегодня|сьогодні|today)/iu,
  /(?:вільний|свободный)\s+час.{0,24}(?:сьогодні|сегодня|today)/iu,
];

/**
 * User asks when they are free today — availability read, never CREATE_EVENT.
 */
export function isCalendarFreeTimeTodayQuery(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized || !TODAY_HINT.test(normalized) || !FREE_AVAILABILITY_HINT.test(normalized)) {
    return false;
  }

  return FREE_TIME_PHRASES.some((pattern) => pattern.test(normalized));
}
