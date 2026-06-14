import { extractDeleteEventTitle } from '@/src/features/agent/calendar/calendarDeleteIntentExtractor';
import { parseCalendarClockMinutes } from '@/src/features/agent/calendarIntelligence/calendarClockParser';
import { resolveTargetDayContext } from '@/src/features/agent/calendarIntelligence/resolveTargetDay';
import {
  logDeleteDisambiguationCandidates,
  logDeleteDisambiguationSelection,
} from '@/src/features/agent/calendar/calendarDeleteDiagnostics';
import { resolveDisambiguationSelection } from '@/src/features/agent/calendar/calendarEventDisambiguation';
import type { CalendarDisambiguationCandidate } from '@/src/features/agent/calendar/calendarEventDisambiguation';
import { bindPendingCalendarDeleteSelection } from '@/src/features/agent/calendar/calendarPendingActionBinding';
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
  const sourceTranscript = params.sourceTranscript.trim();

  return {
    operation: 'delete',
    type: 'delete',
    title: params.titleQuery || extractDeleteEventTitle(sourceTranscript),
    dayHint: null,
    sourceTranscript,
    originalUserText: sourceTranscript,
    createdAtMs: Date.now(),
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
    logDeleteDisambiguationCandidates({
      phase: 'merge_reply',
      candidates: params.pending.candidates,
      replyPreview: reply.slice(0, 120),
    });

    const selected = resolveDisambiguationSelection({
      reply,
      candidates: params.pending.candidates,
      referenceNow,
      timeZone: params.timeZone,
      pendingTitle: params.pending.title,
    });

    if (selected) {
      const next: PendingCalendarDeleteContext = {
        ...params.pending,
        selectedEventId: selected.eventId,
        dayHint: null,
      };

      logDeleteDisambiguationSelection({
        phase: 'merge_reply',
        replyPreview: reply.slice(0, 120),
        selectedEventId: selected.eventId,
        selectedTitle: selected.title,
        selectedStartsAt: selected.startsAt,
      });

      bindPendingCalendarDeleteSelection({
        context: next,
        selectedEventId: selected.eventId,
        replyPreview: reply,
      });

      return {
        context: next,
        transcript: params.pending.sourceTranscript.trim(),
        selectedEventId: selected.eventId,
      };
    }
  }

  const hasClockInReply = parseCalendarClockMinutes(reply, resolveTargetDayContext(reply, referenceNow, params.timeZone)) !== null;

  if (hasClockInReply) {
    return null;
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
