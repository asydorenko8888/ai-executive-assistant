import {
  alarmMatchesSelectorTime,
  formatAlarmClockLabel,
  formatAlarmScheduleLine,
  parseAlarmSelectorTime,
} from '@/src/features/local-alarms/localAlarmTimeMatch';
import type { PendingAlarmSelectionOption } from '@/src/features/local-alarms/localAlarmPendingAction';
import type { LocalAlarm } from '@/src/features/local-alarms/types';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';

const SELECTION_VERB_PREFIX =
  /^(?:please\s+)?(?:удали(?:ть)?|видали(?:ти)?|отмени(?:ть)?|убери(?:ть)?|перенеси(?:ть)?|сдвинь|move|delete|cancel|reschedule)\s+/iu;

function normalizeSelectionReply(reply: string) {
  return reply.trim().replace(/[.!?]+$/g, '');
}

export function extractAlarmSelectionPhrase(reply: string) {
  const normalized = normalizeSelectionReply(reply);
  const withoutVerb = normalized.replace(SELECTION_VERB_PREFIX, '').trim();

  return withoutVerb || normalized;
}

function orderedCandidatesFromOptions(options: PendingAlarmSelectionOption[], alarms: LocalAlarm[]) {
  const alarmById = new Map(alarms.map((alarm) => [alarm.id, alarm]));

  return options
    .slice()
    .sort((left, right) => left.order - right.order)
    .map((option) => alarmById.get(option.id))
    .filter((alarm): alarm is LocalAlarm => Boolean(alarm));
}

function resolveOrdinalIndex(phrase: string, optionCount: number): number | null {
  if (optionCount <= 0) {
    return null;
  }

  const normalized = phrase.trim();

  if (
    /(?:^|\s)(?:the\s+)?first(?:\s+one)?(?:\s|$)/iu.test(normalized) ||
    /(?:^|\s)(?:перв(?:ый|ое|ую|ого)|первый|перш(?:ий|е|у))(?:\s|$)/iu.test(normalized) ||
    /(?:^|\s)1(?:\s|$)/u.test(normalized)
  ) {
    return 0;
  }

  if (
    /(?:^|\s)(?:the\s+)?second(?:\s+one)?(?:\s|$)/iu.test(normalized) ||
    /(?:^|\s)(?:втор(?:ой|ое|ую|ого)|друг(?:ой|ое|ую|ого))(?:\s|$)/iu.test(normalized) ||
    /(?:^|\s)2(?:\s|$)/u.test(normalized)
  ) {
    return 1;
  }

  if (
    /(?:^|\s)(?:the\s+)?last(?:\s+one)?(?:\s|$)/iu.test(normalized) ||
    /(?:^|\s)(?:последн(?:ий|ю|его|яя|ее|і)?|останн(?:ій|ю|ого|я|є))(?:\s|$)/iu.test(normalized)
  ) {
    return optionCount - 1;
  }

  if (
    /(?:^|\s)(?:the\s+)?(?:earlier|soonest)(?:\s+one)?(?:\s|$)/iu.test(normalized) ||
    /(?:^|\s)(?:раньше|ранний|самый\s+ранний|пораньше)(?:\s|$)/iu.test(normalized)
  ) {
    return 0;
  }

  if (
    /(?:^|\s)(?:the\s+)?(?:later|latest)(?:\s+one)?(?:\s|$)/iu.test(normalized) ||
    /(?:^|\s)(?:позже|поздний|самый\s+поздний|попозже)(?:\s|$)/iu.test(normalized)
  ) {
    return optionCount - 1;
  }

  return null;
}

function resolveNumericIndex(phrase: string, optionCount: number) {
  const match = phrase.trim().match(/^(?:номер\s+)?(\d+)$/iu);

  if (!match?.[1]) {
    return null;
  }

  const index = Number(match[1]) - 1;

  if (index < 0 || index >= optionCount) {
    return null;
  }

  return index;
}

function normalizeClockKey(value: string) {
  const match = value.match(/(\d{1,2})[:.](\d{2})/);

  if (!match?.[1] || !match[2]) {
    return null;
  }

  return `${Number(match[1]).toString().padStart(2, '0')}:${match[2]}`;
}

function matchAlarmsByClockPhrase(
  candidates: LocalAlarm[],
  phrase: string,
  languageCode: VoiceLanguageCode,
  referenceNow: Date,
) {
  const phraseClock = normalizeClockKey(phrase);

  if (!phraseClock) {
    return [];
  }

  const [hours, minutes] = phraseClock.split(':').map(Number);

  const probeOnReferenceDay = new Date(referenceNow);
  probeOnReferenceDay.setHours(hours, minutes, 0, 0);

  const referenceDayMatches = candidates.filter((alarm) =>
    alarmMatchesSelectorTime(alarm, probeOnReferenceDay, 0),
  );

  if (referenceDayMatches.length === 1) {
    return referenceDayMatches;
  }

  const labelMatches = candidates.filter((alarm) => {
    const alarmClock = normalizeClockKey(
      formatAlarmClockLabel(alarm.triggerAtMs, languageCode, { hour24: true }),
    );

    return alarmClock === phraseClock;
  });

  if (labelMatches.length === 1) {
    return labelMatches;
  }

  const dayMatches = candidates.filter((alarm) => {
    const probe = new Date(alarm.triggerAtMs);
    probe.setHours(hours, minutes, 0, 0);

    return alarmMatchesSelectorTime(alarm, probe, 0);
  });

  return dayMatches.length === 1 ? dayMatches : [];
}

function matchAlarmsByClockTime(candidates: LocalAlarm[], selectorTime: Date) {
  const selectorHours = selectorTime.getHours();
  const selectorMinutes = selectorTime.getMinutes();

  return candidates.filter((alarm) => {
    const alarmDate = new Date(alarm.triggerAtMs);

    return alarmDate.getHours() === selectorHours && alarmDate.getMinutes() === selectorMinutes;
  });
}

function resolveTimeSelection(params: {
  phrase: string;
  candidates: LocalAlarm[];
  referenceNow: Date;
  languageCode: VoiceLanguageCode;
}) {
  const clockPhraseMatches = matchAlarmsByClockPhrase(
    params.candidates,
    params.phrase,
    params.languageCode,
    params.referenceNow,
  );

  if (clockPhraseMatches.length === 1) {
    return clockPhraseMatches[0] ?? null;
  }

  const selectorTime = parseAlarmSelectorTime(params.phrase, params.referenceNow);

  if (selectorTime) {
    const sameDayMatches = params.candidates.filter((alarm) =>
      alarmMatchesSelectorTime(alarm, selectorTime),
    );

    if (sameDayMatches.length === 1) {
      return sameDayMatches[0] ?? null;
    }

    const clockMatches = matchAlarmsByClockTime(params.candidates, selectorTime);

    if (clockMatches.length === 1) {
      return clockMatches[0] ?? null;
    }
  }

  for (const alarm of params.candidates) {
    if (/today|сегодня|сьогодні/iu.test(params.phrase)) {
      const timeOnly = params.phrase.replace(/.*?(?:today|сегодня|сьогодні)\s*,?\s*/iu, '').trim();
      const todaySelectorTime = parseAlarmSelectorTime(timeOnly, params.referenceNow);

      if (todaySelectorTime) {
        if (alarmMatchesSelectorTime(alarm, todaySelectorTime)) {
          return alarm;
        }

        const clockMatches = matchAlarmsByClockTime([alarm], todaySelectorTime);

        if (clockMatches.length === 1) {
          return clockMatches[0] ?? null;
        }
      }
    }
  }

  return null;
}

export function resolveAlarmSelectionFromReply(params: {
  reply: string;
  candidates: LocalAlarm[];
  orderedOptions?: PendingAlarmSelectionOption[];
  referenceNow: Date;
  languageCode: VoiceLanguageCode;
}) {
  const normalized = normalizeSelectionReply(params.reply);

  if (!normalized) {
    return null;
  }

  const candidates =
    params.orderedOptions != null
      ? orderedCandidatesFromOptions(params.orderedOptions, params.candidates)
      : [...params.candidates].sort((left, right) => left.triggerAtMs - right.triggerAtMs);

  if (candidates.length === 0) {
    return null;
  }

  const selectionPhrases = [normalized, extractAlarmSelectionPhrase(normalized)];

  for (const phrase of selectionPhrases) {
    const phraseClock = normalizeClockKey(phrase);

    if (phraseClock && params.orderedOptions) {
      const optionMatch = params.orderedOptions.find(
        (option) => normalizeClockKey(option.displayTime) === phraseClock,
      );

      if (optionMatch) {
        return candidates.find((candidate) => candidate.id === optionMatch.id) ?? null;
      }
    }
  }

  for (const phrase of selectionPhrases) {
    const ordinalIndex = resolveOrdinalIndex(phrase, candidates.length);

    if (ordinalIndex != null) {
      return candidates[ordinalIndex] ?? null;
    }

    const numericIndex = resolveNumericIndex(phrase, candidates.length);

    if (numericIndex != null) {
      return candidates[numericIndex] ?? null;
    }
  }

  for (const phrase of selectionPhrases) {
    const byTime = resolveTimeSelection({
      phrase,
      candidates,
      referenceNow: params.referenceNow,
      languageCode: params.languageCode,
    });

    if (byTime) {
      return byTime;
    }
  }

  for (const phrase of selectionPhrases) {
    for (const alarm of candidates) {
      const line = formatAlarmScheduleLine(
        alarm.triggerAtMs,
        params.referenceNow.getTime(),
        params.languageCode,
      );

      if (phrase.toLowerCase() === line.toLowerCase()) {
        return alarm;
      }
    }
  }

  return null;
}

export function isLikelyAlarmSelectionReply(reply: string) {
  const normalized = normalizeSelectionReply(reply);

  if (!normalized) {
    return false;
  }

  if (resolveOrdinalIndex(normalized, 3) != null) {
    return true;
  }

  if (/^(?:номер\s+)?\d+$/iu.test(normalized)) {
    return true;
  }

  if (parseAlarmSelectorTime(normalized, new Date())) {
    return true;
  }

  if (/(?:today|сегодня|сьогодні)\s*,?\s*\d/iu.test(normalized)) {
    return true;
  }

  if (SELECTION_VERB_PREFIX.test(normalized)) {
    return true;
  }

  return false;
}
