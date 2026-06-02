import { extractCalendarClockFragment } from '@/src/features/agent/calendarIntelligence/calendarClockParser';

const CALENDAR_CONTEXT =
  /(?:календар[ьяь]?|calendar|запланирован|запланован|событи[ея]|поді[яі]|встреч|зустріч|meeting|event)/iu;

const VISIBILITY_PHRASE =
  /(?:^|[\s,.;:!?—-]+)(?:я\s+не\s+вижу|я\s+не\s+бачу|не\s+вижу|не\s+бачу|не\s+нахожу|не\s+можу\s+найти|i\s+don'?t\s+see|i\s+can'?t\s+see|cannot\s+see|can'?t\s+find)(?:[\s,.;:!?—-]|$)/iu;

const SEARCH_QUERY_START =
  /^(?:please\s+)?(?:где|де|where|покажи|показать|покажіть|show(?:\s+me)?|найди|найти|find|search|есть\s+ли|is\s+there|когда|when|что\s+у\s+меня|що\s+у\s+мене|what\s+do\s+i\s+have)\b/iu;

const FIND_OR_SHOW_CALENDAR =
  /(?:найди|find|покажи|show).{0,80}(?:календар|calendar)/iu;

const CALENDAR_VISIBILITY_COMPLAINT =
  /(?:не\s+вижу|не\s+бачу|don'?t\s+see|can'?t\s+find).{0,120}(?:календар|calendar|запланирован|запланован)/iu;

/**
 * User is asking to find/show/locate an event — never treat as CREATE_EVENT.
 */
export function isCalendarQueryOrFindIntent(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized) {
    return false;
  }

  if (VISIBILITY_PHRASE.test(normalized) || CALENDAR_VISIBILITY_COMPLAINT.test(normalized)) {
    return true;
  }

  if (FIND_OR_SHOW_CALENDAR.test(normalized)) {
    return true;
  }

  if (SEARCH_QUERY_START.test(normalized)) {
    return CALENDAR_CONTEXT.test(normalized) || extractCalendarClockFragment(normalized) !== null;
  }

  return false;
}
