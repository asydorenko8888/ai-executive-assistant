import { logCalendarCreate } from '@/src/features/agent/execution/calendarCreateLogger';

const WORD_EDGE = '(?:^|[\\s,.;:!?—\\-]+)';
const WORD_END = '(?:[\\s,.;:!?—\\-]+|$)';

const COMMAND_PREFIX =
  /^(?:please\s+)?(?:внеси|внести|добав(?:ь|ьте|ить)|создай|создать|запланируй|запланировать|поставь|поставить|занеси|занести|додай|додати|створи|перенеси|заплануй|add|create|schedule|book|put|insert)(?:[\s,:-]+|$)/iu;

const CALENDAR_PHRASES =
  /(?:google\s*)?(?:календар[ьяь]?|calendar)|(?:в|во|в мой|в моей|to|into)\s+(?:google\s*)?(?:календар[ьяь]?|calendar)/giu;

const DATE_WORDS = new RegExp(
  `${WORD_EDGE}(?:today|tomorrow|сьогодні|сегодня|завтра)${WORD_END}`,
  'giu',
);

const TIME_PHRASES = [
  new RegExp(
    `${WORD_EDGE}(?:в|на|at|@|о)\\s+\\d{1,2}(?::\\d{2})?\\s*(?:вечера|вечером|утра|утром|дня|днём|днем|ночи|ночью|am|pm)?${WORD_END}`,
    'giu',
  ),
  new RegExp(
    `${WORD_EDGE}\\d{1,2}(?::\\d{2})?\\s*(?:вечера|вечером|утра|утром|дня|днём|днем|ночи|ночью)${WORD_END}`,
    'giu',
  ),
  new RegExp(`${WORD_EDGE}\\d{1,2}\\s*(?:am|pm|a\\.m\\.|p\\.m\\.)${WORD_END}`, 'giu'),
];

const FILLER_WORDS = new RegExp(
  `${WORD_EDGE}(?:задач[ауеиё]?|событ[иеяё]+|встреч[а-яё]*|meeting|events?|task)${WORD_END}`,
  'giu',
);

const POSSESSIVE_FILLER = new RegExp(`${WORD_EDGE}(?:мой|моей|моего|моём|моем|my)${WORD_END}`, 'giu');

const LEADING_FILLER = /^(?:в|на|at|о|the|a|an)\s+/iu;

function capitalizeFirstLetter(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return trimmed;
  }

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function extractCalendarEventTitle(transcript: string) {
  logCalendarCreate('raw user text', { transcript });

  let title = transcript.trim();
  title = title.replace(COMMAND_PREFIX, '');
  title = title.replace(CALENDAR_PHRASES, ' ');
  title = title.replace(DATE_WORDS, ' ');

  for (const pattern of TIME_PHRASES) {
    title = title.replace(pattern, ' ');
  }

  title = title.replace(FILLER_WORDS, ' ');
  title = title.replace(POSSESSIVE_FILLER, ' ');
  title = title.replace(LEADING_FILLER, '');
  title = title.replace(/^[,.;:\s-]+|[,.;:\s-]+$/gu, '');
  title = title.replace(/\s+/g, ' ').trim();

  const extracted = capitalizeFirstLetter(title);

  logCalendarCreate('extracted title', { extracted });

  return extracted;
}
