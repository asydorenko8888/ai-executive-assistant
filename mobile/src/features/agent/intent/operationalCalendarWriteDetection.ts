/**
 * Detects calendar create/update instructions (any supported language).
 * Used to block emotional / empty-day calendar fallback routing.
 */

const OPERATIONAL_WRITE_VERBS =
  /(?:add|put|create|book|set\s*up|insert|update|move|reschedule|shift|schedule|cancel|delete|remove|внеси|внести|добав(?:ь|ьте|ить)|создай|создать|перенеси|перенести|запланируй|запланировать|поставь|поставить|занеси|занести|додай|додати|створи|перенеси|заплануй)/iu;

const CALENDAR_DOMAIN =
  /(?:google\s*)?calendar|google\s+календар[ьяь]?|календар[ьяь]?|зустріч|встреч|meeting|events?/iu;

/** "внеси … google календарь …" */
const RU_UK_CALENDAR_WRITE_PHRASE =
  /(?:внеси|внести|добав(?:ь|ить)|создай|перенеси|запланируй|поставь|занеси|додай|створи|заплануй).{0,120}(?:google\s*)?(?:календар[ьяь]?|calendar)/iu;

const EN_CALENDAR_WRITE_PHRASE =
  /(?:add|put|create|move|insert|update|schedule|book).{0,120}(?:google\s*)?calendar/iu;

/** Calendar domain + write verb anywhere in the utterance. */
const CALENDAR_WRITE_LOOSE =
  /(?:внеси|внести|добав(?:ь|ить)|создай|запланируй|поставь|занеси|додай|створи|заплануй|add|create|schedule|book).{0,160}(?:календар|calendar|google)/iu;

/** "напомни" only when calendar is explicitly mentioned. */
const REMIND_INTO_CALENDAR =
  /(?:напомни|нагадай|remind).{0,80}(?:календар|calendar|google)/iu;

/** Command at start + date/time — no "calendar" word required (e.g. "внеси завтра в 6:00 …"). */
const WRITE_VERB_AT_START =
  /^(?:please\s+)?(?:внеси|внести|добав(?:ь|ьте|ить)|создай|создать|запланируй|запланировать|поставь|поставить|занеси|занести|додай|додати|створи|перенеси|заплануй|add|create|schedule|book|put|insert)(?:[\s,:-]|$)/iu;

const SCHEDULE_TIME_HINT =
  /\b(?:today|tomorrow|завтра|сегодня|сьогодні|післязавтра|послезавтра|утра|утром|вечера|вечером|дня|днём|днем|ночи|ночью|am|pm|a\.m\.|p\.m\.|\d{1,2}(?::\d{2})?)\b/iu;

const WEEKDAY_HINT =
  /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|понедельник|вторник|сред|четверг|пятниц|суббот|воскрес|понеділок|вівторок|середу|четвер|п'ятниц|субот|неділ)\b/iu;

export function isOperationalCalendarWriteRequest(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized) {
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

  if (WRITE_VERB_AT_START.test(normalized) && (SCHEDULE_TIME_HINT.test(normalized) || WEEKDAY_HINT.test(normalized))) {
    return true;
  }

  return OPERATIONAL_WRITE_VERBS.test(normalized) && CALENDAR_DOMAIN.test(normalized);
}
