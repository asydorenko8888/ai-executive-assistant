import { detectCalendarCreateByTitleTimePattern } from '@/src/features/agent/calendar/calendarCreateByTitleTime';
import {
  asksAboutEventsAtClock,
  extractCalendarClockFragment,
} from '@/src/features/agent/calendarIntelligence/calendarClockParser';
import {
  CALENDAR_CLOCK_PREPOSITION,
  CALENDAR_WORD_EDGE,
  CALENDAR_WORD_END,
} from '@/src/features/agent/calendarIntelligence/calendarTextBoundaries';
import {
  classifyCalendarReadTimeKind,
  isCalendarReadBlockedByWriteIntent,
  normalizeCalendarReadSemantics,
} from '@/src/features/agent/calendarIntelligence/calendarReadTimeIntent';

const READ_QUESTION_WORDS =
  /(?:какая|какой|какую|какое|какие|что(?:\s+у\s+меня|\s+стоит)?|що(?:\s+у\s+мене|\s+стоит)?|яка|який|які|which|what(?:\s+do\s+i\s+have)?)/iu;

const READ_SCHEDULE_WORDS =
  /(?:задач|событи|поді[яі]|встреч|зустріч|meetings?|events?|tasks?|стоит(?!\s+ли)|запланирован|запланован|у\s+календар|в\s+календар|календар)/iu;

const READ_DAY_ANCHOR = new RegExp(
  `${CALENDAR_WORD_EDGE}(?:сьогодні|сегодня|завтра|today|tomorrow|післязавтра|послезавтра)${CALENDAR_WORD_END}`,
  'iu',
);

const RU_TASK_AT_TIME_READ = new RegExp(
  `(?:какая|какой|какие|что|що|яка|які).{0,56}(?:задач|стоит|календар).{0,56}(?:${CALENDAR_CLOCK_PREPOSITION})\\s*\\d{1,2}`,
  'iu',
);

const RU_TASK_AT_TIME_READ_DAY_BEFORE = new RegExp(
  `(?:какая|какой|какие|что|що|яка|які).{0,56}(?:задач|стоит).{0,32}(?:сегодня|сьогодні|завтра|today|tomorrow).{0,24}(?:${CALENDAR_CLOCK_PREPOSITION})\\s*\\d{1,2}`,
  'iu',
);

const RU_TASK_AT_TIME_READ_DAY_AFTER = new RegExp(
  `(?:какая|какой|какие|что|що|яка|які).{0,56}(?:задач|стоит).{0,40}(?:${CALENDAR_CLOCK_PREPOSITION})\\s*\\d{1,2}.{0,24}(?:сегодня|сьогодні|завтра|today|tomorrow)`,
  'iu',
);

export function isCalendarExactTimeReadQuery(transcript: string) {
  const normalized = normalizeCalendarReadSemantics(transcript);

  if (detectCalendarCreateByTitleTimePattern(normalized)) {
    return false;
  }

  if (classifyCalendarReadTimeKind(transcript)) {
    return true;
  }

  if (!normalized || !extractCalendarClockFragment(normalized)) {
    return false;
  }

  if (new RegExp(`${CALENDAR_WORD_EDGE}стоит\\s+ли${CALENDAR_WORD_END}`, 'iu').test(normalized)) {
    return false;
  }

  if (isCalendarReadBlockedByWriteIntent(transcript)) {
    return false;
  }

  if (RU_TASK_AT_TIME_READ.test(normalized) || RU_TASK_AT_TIME_READ_DAY_AFTER.test(normalized) || RU_TASK_AT_TIME_READ_DAY_BEFORE.test(normalized)) {
    return true;
  }

  const hasQuestion = READ_QUESTION_WORDS.test(normalized);
  const hasScheduleWord = READ_SCHEDULE_WORDS.test(normalized);
  const hasDayAnchor = READ_DAY_ANCHOR.test(normalized);

  if (hasQuestion && (hasScheduleWord || hasDayAnchor)) {
    return true;
  }

  return asksAboutEventsAtClock(normalized);
}

export function isCalendarExactTimeReadBlockedWriteRequest(transcript: string) {
  return isCalendarExactTimeReadQuery(transcript);
}
