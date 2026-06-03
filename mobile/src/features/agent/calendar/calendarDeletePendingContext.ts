import { extractDeleteEventTitle } from '@/src/features/agent/calendar/calendarDeleteIntentExtractor';
import {
  buildTranscriptFromSelectedDisambiguationCandidate,
  resolveDisambiguationSelection,
} from '@/src/features/agent/calendar/calendarEventDisambiguation';
import type { CalendarDisambiguationCandidate } from '@/src/features/agent/calendar/calendarEventDisambiguation';
import type { PendingCalendarDeleteContext } from '@/src/features/agent/execution/calendarExecutionSession';

const DAY_HINT_REPLY =
  /(?:завтра|tomorrow|today|сьогодні|сегодня|післязавтра|послезавтра|вчора|yesterday)/iu;

const POSSESSIVE_DAY_REPLY =
  /(?:завтрашн|tomorrow'?s?|today'?s?|сьогоднішн|сегодняшн)/iu;

function usesCyrillicDeleteTemplate(sourceTranscript: string) {
  return /[а-яёіїєґ]/iu.test(sourceTranscript);
}

export function buildTranscriptFromPendingDeleteContext(context: PendingCalendarDeleteContext) {
  const title = context.title?.trim() ?? '';
  const dayHint = context.dayHint?.trim() ?? '';

  if (title && dayHint) {
    if (usesCyrillicDeleteTemplate(context.sourceTranscript)) {
      return `Удали ${title} ${dayHint}`.replace(/\s+/g, ' ').trim();
    }

    return `Delete ${title} ${dayHint}`.replace(/\s+/g, ' ').trim();
  }

  if (title) {
    return `Удали ${title} ${context.dayHint ?? ''}`.replace(/\s+/g, ' ').trim();
  }

  return context.sourceTranscript.trim();
}

export function pendingDeleteContextFromResolution(params: {
  sourceTranscript: string;
  titleQuery: string;
  candidates?: CalendarDisambiguationCandidate[];
  deleteAll?: boolean;
}): PendingCalendarDeleteContext {
  return {
    operation: 'delete',
    title: params.titleQuery || extractDeleteEventTitle(params.sourceTranscript),
    dayHint: null,
    sourceTranscript: params.sourceTranscript.trim(),
    candidates: params.candidates,
    deleteAll: params.deleteAll ?? false,
  };
}

export function tryMergePendingCalendarDeleteReply(params: {
  pending: PendingCalendarDeleteContext;
  reply: string;
  referenceNow?: Date;
  timeZone?: string;
}) {
  const reply = params.reply.trim();
  const referenceNow = params.referenceNow ?? new Date();

  if (!reply) {
    return null;
  }

  if (params.pending.candidates && params.pending.candidates.length > 0) {
    const selected = resolveDisambiguationSelection({
      reply,
      candidates: params.pending.candidates,
      referenceNow,
      timeZone: params.timeZone,
    });

    if (selected) {
      const next: PendingCalendarDeleteContext = {
        ...params.pending,
        selectedEventId: selected.eventId,
        dayHint: null,
      };

      return {
        context: next,
        transcript: buildTranscriptFromSelectedDisambiguationCandidate({
          action: 'delete',
          candidate: selected,
          sourceTranscript: params.pending.sourceTranscript,
        }),
        selectedEventId: selected.eventId,
      };
    }
  }

  if (!DAY_HINT_REPLY.test(reply) && !POSSESSIVE_DAY_REPLY.test(reply)) {
    return null;
  }

  let dayHint = reply;

  if (POSSESSIVE_DAY_REPLY.test(reply)) {
    if (/завтрашн/i.test(reply)) {
      dayHint = 'завтра';
    } else if (/tomorrow/i.test(reply)) {
      dayHint = 'tomorrow';
    } else if (/today/i.test(reply) || /сьогоднішн/i.test(reply)) {
      dayHint = 'сьогодні';
    } else if (/сегодняшн/i.test(reply)) {
      dayHint = 'сегодня';
    }
  }

  const next: PendingCalendarDeleteContext = {
    ...params.pending,
    dayHint,
  };

  return {
    context: next,
    transcript: buildTranscriptFromPendingDeleteContext(next),
  };
}
