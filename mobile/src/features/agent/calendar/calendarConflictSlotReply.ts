import { isCalendarExactTimeReadQuery } from '@/src/features/agent/calendarIntelligence/calendarExactTimeReadDetection';
import {
  CALENDAR_WORD_EDGE,
  CALENDAR_WORD_END,
} from '@/src/features/agent/calendarIntelligence/calendarTextBoundaries';
import {
  isOperationalCalendarDeleteRequest,
  isOperationalCalendarUpdateRequest,
} from '@/src/features/agent/intent/operationalCalendarWriteDetection';

const CALENDAR_WRITE_VERB_START =
  /^(?:please\s+)?(?:добав(?:ь|ьте|ить)|додай|створи|создай|запланируй|внеси|add|create|schedule|book|перенеси|перенести|move|reschedule|удали|удалить|видали|видалити|delete|remove|cancel)/iu;

/** User explicitly accepts overlapping the conflicting event. */
export const EXPLICIT_CONFLICT_OVERRIDE =
  /(?:^|[\s,.;:!?—-]+)(?:вс[её]\s*равно|все\s*одно|вс[её]\s*одно|force|anyway|still\s+(?:create|schedule|book|move|add)|move\s+it\s+anyway|create\s+it\s+anyway|schedule\s+it\s+anyway|создай\s+вс[её]\s*равно|перенес(?:и|и)\s+вс[её]\s*равно|добав(?:ь|ьте)\s+вс[её]\s*равно)(?:[,.!\s]|$)/iu;

const CONFLICT_SLOT_ACCEPTANCE = new RegExp(
  `${CALENDAR_WORD_EDGE}(?:хорош(?:ий|ая|е)\\s+вариант|подходит|підходить|отлично|супер|ідеально|идеально|давай(?:те)?\\s+так|that\\s+works|sounds\\s+good|works|сойдёт|сойдет|підійде)${CALENDAR_WORD_END}`,
  'giu',
);

const CONFLICT_SLOT_SHORT_ORDINAL = new RegExp(
  `${CALENDAR_WORD_EDGE}(?:first|second|third|перв(?:ый|ый)|втор(?:ой|ий)|трет(?:ий|ій))(?:\\s+(?:one|option|вариант|варіант))?${CALENDAR_WORD_END}`,
  'giu',
);

const CONFLICT_SLOT_ORDINAL = new RegExp(
  `${CALENDAR_WORD_EDGE}(?:перв(?:ый|ый)|перш(?:ий|а)|first|втор(?:ой|ий)|second|друг(?:ой|ий)|another|трет(?:ий|ій)|third)\\s+вариант${CALENDAR_WORD_END}`,
  'giu',
);

const CONFLICT_SLOT_NUMBERED = new RegExp(
  `${CALENDAR_WORD_EDGE}(?:вариант|варіант|option)\\s+([1-9])${CALENDAR_WORD_END}`,
  'giu',
);

const CONFLICT_SLOT_BARE_INDEX = /^(?:[1-9])$/u;

const CONFLICT_BARE_PROCEED =
  /^(?:please\s+)?(?:yes|yeah|yep|ok|okay|sure|confirm|да|так|ага|конечно|go\s+ahead|do\s+it)(?:[,.!\s]|$)/iu;

/** Strip acceptance / ordinal noise before matching a suggested conflict slot time. */
export function stripConflictSlotReplyNoise(text: string) {
  let cleaned = text.trim();

  for (let pass = 0; pass < 3; pass += 1) {
    const next = cleaned
      .replace(CONFLICT_SLOT_ACCEPTANCE, ' ')
      .replace(CONFLICT_SLOT_SHORT_ORDINAL, ' ')
      .replace(CONFLICT_SLOT_ORDINAL, ' ')
      .replace(CONFLICT_SLOT_NUMBERED, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (next === cleaned) {
      break;
    }

    cleaned = next;
  }

  return cleaned.replace(/^[\s,.:;!\-—]+|[\s,.:;!\-—]+$/gu, '').trim();
}

export function isConflictSlotSelectionReply(text: string) {
  const normalized = text.trim();

  if (!normalized) {
    return false;
  }

  if (
    CONFLICT_SLOT_ACCEPTANCE.test(normalized) ||
    CONFLICT_SLOT_SHORT_ORDINAL.test(normalized) ||
    CONFLICT_SLOT_ORDINAL.test(normalized) ||
    CONFLICT_SLOT_NUMBERED.test(normalized) ||
    CONFLICT_SLOT_BARE_INDEX.test(normalized)
  ) {
    return true;
  }

  return /^(?:первый|перший|перша|второй|вторий|третий|третій|first|second|third)(?:\s+(?:one|option))?$/iu.test(
    normalized,
  );
}

export function isConflictSlotAcceptanceOnly(text: string) {
  const stripped = stripConflictSlotReplyNoise(text);

  return stripped.length === 0;
}

export function isBareConflictProceedReply(text: string) {
  return CONFLICT_BARE_PROCEED.test(text.trim());
}

export function isExplicitConflictOverrideReply(text: string) {
  return EXPLICIT_CONFLICT_OVERRIDE.test(text.trim());
}

/** True when the user is naming a time/slot — not re-sending a full calendar command or read query. */
export function isConflictBareScheduleReply(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized || isCalendarExactTimeReadQuery(normalized)) {
    return false;
  }

  if (
    CALENDAR_WRITE_VERB_START.test(normalized) ||
    isOperationalCalendarUpdateRequest(normalized) ||
    isOperationalCalendarDeleteRequest(normalized)
  ) {
    return false;
  }

  return true;
}

export function resolveConflictSlotOrdinalIndex(text: string) {
  const normalized = text.trim().toLowerCase();
  const numbered = normalized.match(/^(?:вариант|варіант|option)\s+([1-9])$/iu);

  if (numbered?.[1]) {
    return Number(numbered[1]) - 1;
  }

  const bare = normalized.match(/^([1-9])$/);

  if (bare?.[1]) {
    return Number(bare[1]) - 1;
  }

  const ordinalMap: Record<string, number> = {
    первый: 0,
    перша: 0,
    перший: 0,
    first: 0,
    второй: 1,
    second: 1,
    другой: 1,
    другий: 1,
    another: 1,
    третий: 2,
    третій: 2,
    third: 2,
  };

  const phrase = normalized.match(
    /^(первый|перший|перша|второй|вторий|третий|третій|first|second|third)(?:\s+(?:вариант|варіант|one|option))?$/iu,
  );

  if (phrase?.[1]) {
    return ordinalMap[phrase[1].toLowerCase()] ?? null;
  }

  return ordinalMap[normalized] ?? null;
}
