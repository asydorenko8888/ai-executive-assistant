/**
 * Detects calendar create/update vs delete instructions (any supported language).
 */

import {
  RELATIVE_SHIFT_HINT,
  UPDATE_WRITE_VERBS,
} from '@/src/features/agent/calendar/calendarUpdateVerbs';
import { isCalendarCreateByTitleTimePattern } from '@/src/features/agent/calendar/calendarCreateByTitleTime';
import { hasSpokenTimeHint } from '@/src/features/agent/calendar/calendarSpokenTime';
import { isCalendarQueryOrFindIntent } from '@/src/features/agent/calendar/calendarQueryIntent';
import { isCalendarExactTimeReadQuery } from '@/src/features/agent/calendarIntelligence/calendarExactTimeReadDetection';

function isExactTimeReadQuery(transcript: string) {
  return isCalendarExactTimeReadQuery(transcript);
}

const CREATE_WRITE_VERBS =
  /(?:add|put|create|book|set\s*up|insert|schedule|внеси|внести|добав(?:ь|ьте|ить)|создай|создать|запланируй|запланировать|поставь|поставить|занеси|занести|додай|додати|створи|заплануй)/iu;

const DELETE_WRITE_VERBS =
  /(?:delete|remove|cancel|clear|удали|удалить|убери|отмени|отменить|прибери|скасуй|скасувати|видали|видалити)/iu;

const CALENDAR_DOMAIN =
  /(?:google\s*)?calendar|google\s+календар[ьяь]?|календар[ьяь]?|зустріч|встреч|meeting|events?/iu;

const RU_UK_CALENDAR_WRITE_PHRASE =
  /(?:внеси|внести|добав(?:ь|ить)|создай|перенеси|запланируй|поставь|занеси|додай|створи|заплануй).{0,120}(?:google\s*)?(?:календар[ьяь]?|calendar)/iu;

const RU_UK_CALENDAR_DELETE_PHRASE =
  /(?:удали|удалить|убери|отмени|отменить|прибери|видали|видалити|скасуй).{0,120}(?:google\s*)?(?:календар[ьяь]?|calendar|событ|встреч)/iu;

const EN_CALENDAR_WRITE_PHRASE =
  /(?:add|put|create|move|insert|update|schedule|book).{0,120}(?:google\s*)?calendar/iu;

const EN_CALENDAR_DELETE_PHRASE =
  /(?:delete|remove|cancel).{0,120}(?:google\s*)?(?:calendar|event|meeting)/iu;

const CALENDAR_WRITE_LOOSE =
  /(?:внеси|внести|добав(?:ь|ить)|создай|запланируй|поставь|занеси|додай|створи|заплануй|add|create|schedule|book).{0,160}(?:календар|calendar|google)/iu;

const REMIND_INTO_CALENDAR =
  /(?:напомни|нагадай|remind).{0,80}(?:календар|calendar|google)/iu;

const WRITE_VERB_AT_START =
  /^(?:please\s+)?(?:внеси|внести|добав(?:ь|ьте|ить)|создай|создать|запланируй|запланировать|поставь|поставить|занеси|занести|додай|додати|створи|перенеси|заплануй|add|create|schedule|book|put|insert)(?:[\s,:-]|$)/iu;

const IMPLICIT_SCHEDULE_AT_START =
  /^(?:please\s+)?(?:schedule|book|запланируй|запланировать|заплануй|поставь|поставить|запиши|записать)(?:[\s,:-]|$)/iu;

const DELETE_VERB_AT_START =
  /^(?:please\s+)?(?:удали|удалить|убери|отмени|отменить|прибери|скасуй|скасувати|видали|видалити|delete|remove|cancel)(?:[\s,:-]|$)/iu;

const SCHEDULE_TIME_HINT =
  /\b(?:today|tomorrow|завтра|сегодня|сьогодні|післязавтра|послезавтра|утра|утром|вечера|вечером|вечора|увечері|дня|днём|днем|ночи|ночью|am|pm|a\.m\.|p\.m\.|\d{1,2}(?::\d{2})?)\b/iu;

function hasScheduleTimeHint(transcript: string) {
  return SCHEDULE_TIME_HINT.test(transcript) || hasSpokenTimeHint(transcript);
}

const WEEKDAY_HINT =
  /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|понедельник|вторник|сред|четверг|пятниц|суббот|воскрес|понеділок|вівторок|середу|четвер|п'ятниц|субот|неділ)\b/iu;

function hasBareUpdateTitleCandidate(transcript: string) {
  const withoutVerb = transcript.replace(UPDATE_WRITE_VERBS, ' ').replace(/\s+/g, ' ').trim();

  return withoutVerb.length >= 2;
}

export function isOperationalCalendarDeleteRequest(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized) {
    return false;
  }

  if (DELETE_VERB_AT_START.test(normalized)) {
    return true;
  }

  if (isExactTimeReadQuery(normalized)) {
    return false;
  }

  if (
    RU_UK_CALENDAR_DELETE_PHRASE.test(normalized) ||
    EN_CALENDAR_DELETE_PHRASE.test(normalized)
  ) {
    return true;
  }

  return DELETE_WRITE_VERBS.test(normalized) && CALENDAR_DOMAIN.test(normalized);
}

export function isOperationalCalendarUpdateRequest(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized || isExactTimeReadQuery(normalized) || isOperationalCalendarDeleteRequest(normalized)) {
    return false;
  }

  if (!UPDATE_WRITE_VERBS.test(normalized)) {
    return false;
  }

  if (
    CALENDAR_DOMAIN.test(normalized) ||
    hasScheduleTimeHint(normalized) ||
    WEEKDAY_HINT.test(normalized) ||
    RELATIVE_SHIFT_HINT.test(normalized)
  ) {
    return true;
  }

  return hasBareUpdateTitleCandidate(normalized);
}

export function isOperationalCalendarCreateRequest(transcript: string) {
  const normalized = transcript.trim();

  if (
    !normalized ||
    isCalendarQueryOrFindIntent(normalized) ||
    isExactTimeReadQuery(normalized) ||
    isOperationalCalendarDeleteRequest(normalized) ||
    isOperationalCalendarUpdateRequest(normalized)
  ) {
    return false;
  }

  if (
    RU_UK_CALENDAR_WRITE_PHRASE.test(normalized) ||
    EN_CALENDAR_WRITE_PHRASE.test(normalized) ||
    CALENDAR_WRITE_LOOSE.test(normalized) ||
    REMIND_INTO_CALENDAR.test(normalized)
  ) {
    return true;
  }

  if (WRITE_VERB_AT_START.test(normalized) && (hasScheduleTimeHint(normalized) || WEEKDAY_HINT.test(normalized))) {
    return true;
  }

  if (
    IMPLICIT_SCHEDULE_AT_START.test(normalized) &&
    (hasScheduleTimeHint(normalized) || WEEKDAY_HINT.test(normalized))
  ) {
    return true;
  }

  if (isCalendarCreateByTitleTimePattern(normalized)) {
    return true;
  }

  return CREATE_WRITE_VERBS.test(normalized) && CALENDAR_DOMAIN.test(normalized);
}

/** Create, update, or delete — routes to operational executor (never LLM). */
export function isOperationalCalendarWriteRequest(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized || isExactTimeReadQuery(normalized)) {
    return false;
  }

  return (
    isOperationalCalendarCreateRequest(transcript) ||
    isOperationalCalendarUpdateRequest(transcript) ||
    isOperationalCalendarDeleteRequest(transcript)
  );
}
