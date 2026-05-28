/**
 * Detects calendar create/update instructions (any supported language).
 * Used to block emotional / empty-day calendar fallback routing.
 */

const OPERATIONAL_WRITE_VERBS =
  /(?:add|put|create|book|set\s*up|insert|update|move|reschedule|shift|schedule|cancel|delete|remove|внеси|внести|добав(?:ь|ьте|ить)|создай|создать|перенеси|перенести|запланируй|запланировать|поставь|поставить|занеси|занести|додай|додати|створи|перенеси|заплануй)/iu;

const CALENDAR_DOMAIN =
  /(?:google\s*)?calendar|google\s+календар|календар|зустріч|встреч|meeting|event/iu;

/** "внеси … google календарь … завтра … встречу" */
const RU_UK_CALENDAR_WRITE_PHRASE =
  /(?:внеси|внести|добав(?:ь|ить)|создай|перенеси|запланируй|поставь|занеси|додай|створи|заплануй).{0,100}(?:google\s*)?(?:календар|calendar)/iu;

const EN_CALENDAR_WRITE_PHRASE =
  /(?:add|put|create|move|insert|update|schedule|book).{0,100}(?:google\s*)?calendar/iu;

export function isOperationalCalendarWriteRequest(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized) {
    return false;
  }

  if (RU_UK_CALENDAR_WRITE_PHRASE.test(normalized) || EN_CALENDAR_WRITE_PHRASE.test(normalized)) {
    return true;
  }

  return OPERATIONAL_WRITE_VERBS.test(normalized) && CALENDAR_DOMAIN.test(normalized);
}
