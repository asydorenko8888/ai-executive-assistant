import { isCalendarQueryOrFindIntent } from '@/src/features/agent/calendar/calendarQueryIntent';
import { normalizeCalendarEventTitle } from '@/src/features/agent/calendar/calendarEventTitleNormalization';
import { logCreateParse } from '@/src/features/agent/calendar/calendarCreateParseDiagnostics';
import { cleanCreateEventTitleText } from '@/src/features/agent/calendar/calendarCreateTitleCleaner';
import {
  CALENDAR_WORD_EDGE,
  CALENDAR_WORD_END,
} from '@/src/features/agent/calendarIntelligence/calendarTextBoundaries';

/** Create verbs — stripped before title extraction (RU + UA + EN). */
const CREATE_VERB =
  '(?:внеси|внести|добав(?:ь|ьте|ить)|создай|создать|запланируй|запланировать|постав(?:ь|ить)?|назнач(?:ь|ить)?|занеси|занести|додай|додати|створи|заплануй|признач(?:ь|ити)?|запиши|записать|add|create|schedule|book|put|insert)';

export const CREATE_COMMAND_PREFIX = new RegExp(
  `^(?:please\\s+)?${CREATE_VERB}(?:[\\s,:-]+|$)`,
  'iu',
);

const CREATE_VERB_ANYWHERE = new RegExp(
  `${CALENDAR_WORD_EDGE}${CREATE_VERB}${CALENDAR_WORD_END}`,
  'giu',
);

function resetCreateVerbRegex() {
  CREATE_VERB_ANYWHERE.lastIndex = 0;
}

function textContainsCreateVerb(text: string) {
  resetCreateVerbRegex();

  return CREATE_VERB_ANYWHERE.test(text);
}

/** Keep only the span from the last create verb so conversational prefixes are not part of the title. */
function isolateLastCreateCommandSegment(text: string) {
  resetCreateVerbRegex();
  const matches = [...text.matchAll(CREATE_VERB_ANYWHERE)];

  if (matches.length === 0) {
    return text.trim();
  }

  const last = matches[matches.length - 1];

  if (last.index === undefined) {
    return text.trim();
  }

  return text.slice(last.index).trim();
}

function stripCreateVerbs(text: string) {
  let cleaned = text.replace(CREATE_COMMAND_PREFIX, '').trim();
  resetCreateVerbRegex();
  cleaned = cleaned.replace(CREATE_VERB_ANYWHERE, ' ');

  return cleaned.replace(/\s+/g, ' ').trim();
}

export type CreateTitleParseContext = {
  detectedDate?: string | null;
  detectedTime?: string | null;
};

export function extractCreateEventTitle(
  currentUserMessage: string,
  context: CreateTitleParseContext = {},
) {
  const originalText = currentUserMessage.trim();

  if (!originalText || isCalendarQueryOrFindIntent(originalText)) {
    logCreateParse({
      originalText,
      cleanedText: '',
      extractedTitle: null,
      detectedDate: context.detectedDate ?? null,
      detectedTime: context.detectedTime ?? null,
    });

    return null;
  }

  if (!CREATE_COMMAND_PREFIX.test(originalText) && !textContainsCreateVerb(originalText)) {
    logCreateParse({
      originalText,
      cleanedText: '',
      extractedTitle: null,
      detectedDate: context.detectedDate ?? null,
      detectedTime: context.detectedTime ?? null,
    });

    return null;
  }

  let text = isolateLastCreateCommandSegment(originalText);
  text = stripCreateVerbs(text);
  text = cleanCreateEventTitleText(text);
  const extractedTitle =
    text.length >= 2 ? normalizeCalendarEventTitle(text, originalText) : null;

  logCreateParse({
    originalText,
    cleanedText: text,
    extractedTitle,
    detectedDate: context.detectedDate ?? null,
    detectedTime: context.detectedTime ?? null,
  });

  return extractedTitle;
}
