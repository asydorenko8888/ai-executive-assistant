import {
  extractCalendarUpdateParameters,
  type CalendarUpdateExtractResult,
} from '@/src/features/agent/calendar/calendarUpdateIntentExtractor';
import { isCalendarExactTimeReadQuery } from '@/src/features/agent/calendarIntelligence/calendarExactTimeReadDetection';
import { logUpdateClarificationMerged } from '@/src/features/agent/calendar/calendarUpdateLogger';
import {
  applyClockLabelToEventStartIso,
  formatClockLabelFromInstantMs,
  parseCalendarUpdateSchedule,
  resolveUpdateTargetMs,
} from '@/src/features/agent/calendar/calendarUpdateScheduleParser';
import { getExecutiveCalendarTimezone } from '@/src/features/agent/calendar/calendarTimezone';
import type { PendingCalendarUpdateContext } from '@/src/features/agent/execution/calendarExecutionSession';
import {
  buildTranscriptFromSelectedDisambiguationCandidate,
  inferCalendarDisambiguationLocale,
  resolveDisambiguationSelection,
} from '@/src/features/agent/calendar/calendarEventDisambiguation';
import {
  logCalendarPendingActionResolved,
} from '@/src/features/agent/calendar/calendarMoveTraceLogger';
import type { CalendarDisambiguationCandidate } from '@/src/features/agent/calendar/calendarEventDisambiguation';

const TIME_ONLY_REPLY = /^(\d{1,2}:\d{2})$/;
const BARE_HOUR_REPLY = /^(\d{1,2})$/;
const SCHEDULE_FOLLOWUP_REPLY =
  /(?:завтра|tomorrow|today|сьогодні|сегодня|післязавтра|послезавтра|\d{1,2}:\d{2}|на\s+\d)/iu;

function usesCyrillicUpdateTemplate(sourceTranscript: string) {
  return /[а-яёіїєґ]/iu.test(sourceTranscript);
}

function clockLabelFromStartISO(startISO: string | null | undefined, timeZone: string) {
  if (!startISO) {
    return '';
  }

  const instantMs = Date.parse(startISO);

  if (Number.isNaN(instantMs)) {
    return '';
  }

  return formatClockLabelFromInstantMs(instantMs, timeZone);
}

export function buildTranscriptFromPendingContext(context: PendingCalendarUpdateContext) {
  const timeZone = getExecutiveCalendarTimezone();
  const title = context.title?.trim() ?? '';
  const fromTime = clockLabelFromStartISO(context.fromStartISO, timeZone);
  const toTime = clockLabelFromStartISO(context.toStartISO, timeZone);

  if (title && fromTime && toTime) {
    if (usesCyrillicUpdateTemplate(context.sourceTranscript)) {
      return `Перенеси ${title} с ${fromTime} на ${toTime}`;
    }

    return `Move ${title} from ${fromTime} to ${toTime}`;
  }

  if (title && toTime && !fromTime) {
    return context.sourceTranscript.trim();
  }

  const fragments = [context.sourceTranscript.trim()];

  if (title && !context.sourceTranscript.toLowerCase().includes(title.toLowerCase())) {
    fragments.push(title);
  }

  if (fromTime && !context.sourceTranscript.includes(fromTime)) {
    fragments.push(`с ${fromTime}`);
  }

  if (toTime && !context.sourceTranscript.includes(toTime)) {
    fragments.push(`на ${toTime}`);
  }

  return fragments.join(' ').replace(/\s+/g, ' ').trim();
}

function resolveMoveDeltaMsFromSource(params: {
  sourceTranscript: string;
  extraction: CalendarUpdateExtractResult;
  referenceNow: Date;
}) {
  const fromMs = params.extraction.fromStartISO ? Date.parse(params.extraction.fromStartISO) : NaN;
  const toMs = params.extraction.toStartISO ? Date.parse(params.extraction.toStartISO) : NaN;

  if (Number.isFinite(fromMs) && Number.isFinite(toMs)) {
    return toMs - fromMs;
  }

  const timeZone = getExecutiveCalendarTimezone();
  const schedule = parseCalendarUpdateSchedule(params.sourceTranscript, params.referenceNow, timeZone);

  if (schedule.ok && schedule.kind === 'relative_offset') {
    return schedule.direction === 'later' ? schedule.offsetMs : -schedule.offsetMs;
  }

  return null;
}

export function resolvePendingUpdateTargetStartISO(params: {
  pending: PendingCalendarUpdateContext;
  selectedStartISO: string;
  referenceNow: Date;
}): string | null {
  if (params.pending.toStartISO) {
    return params.pending.toStartISO;
  }

  const timeZone = getExecutiveCalendarTimezone();
  const matchedEventStartMs = Date.parse(params.selectedStartISO);

  if (!Number.isFinite(matchedEventStartMs)) {
    return null;
  }

  const schedule = parseCalendarUpdateSchedule(
    params.pending.sourceTranscript,
    params.referenceNow,
    timeZone,
  );

  if (!schedule.ok) {
    return null;
  }

  const toMs = resolveUpdateTargetMs({
    schedule,
    matchedEventStartMs,
    referenceNow: params.referenceNow,
    timeZone,
  });

  if (toMs === null || Number.isNaN(toMs)) {
    return null;
  }

  return new Date(toMs).toISOString();
}

export function pendingContextFromExtraction(params: {
  sourceTranscript: string;
  extraction: CalendarUpdateExtractResult;
  candidates?: CalendarDisambiguationCandidate[];
  referenceNow?: Date;
}): PendingCalendarUpdateContext {
  const referenceNow = params.referenceNow ?? new Date();
  const moveDeltaMs = resolveMoveDeltaMsFromSource({
    sourceTranscript: params.sourceTranscript,
    extraction: params.extraction,
    referenceNow,
  });

  return {
    operation: 'update',
    action: 'move',
    title: params.extraction.title,
    fromStartISO: params.extraction.fromStartISO,
    toStartISO: params.extraction.toStartISO,
    sourceTranscript: params.sourceTranscript.trim(),
    candidates: params.candidates,
    candidateEventIds: params.candidates?.map((candidate) => candidate.eventId),
    candidateStartTimes: params.candidates?.map((candidate) => candidate.startsAt),
    moveDeltaMs,
    requestedTargetStartISO: params.extraction.toStartISO,
  };
}

function applyClockReplyToPendingContext(params: {
  pending: PendingCalendarUpdateContext;
  clockLabel: string;
  referenceNow: Date;
}) {
  const timeZone = getExecutiveCalendarTimezone();
  const anchorStartISO = params.pending.fromStartISO ?? params.pending.toStartISO;
  const next: PendingCalendarUpdateContext = { ...params.pending };

  if (!next.toStartISO) {
    const resolvedToIso = anchorStartISO
      ? applyClockLabelToEventStartIso({
          anchorStartISO,
          clockLabel: params.clockLabel,
          timeZone,
        })
      : null;

    if (resolvedToIso) {
      next.toStartISO = resolvedToIso;
    }
  } else if (!next.fromStartISO && anchorStartISO) {
    const resolvedFromIso = applyClockLabelToEventStartIso({
      anchorStartISO,
      clockLabel: params.clockLabel,
      timeZone,
    });

    if (resolvedFromIso) {
      next.fromStartISO = resolvedFromIso;
    }
  } else {
    const resolvedToIso = anchorStartISO
      ? applyClockLabelToEventStartIso({
          anchorStartISO,
          clockLabel: params.clockLabel,
          timeZone,
        })
      : null;

    if (resolvedToIso) {
      next.toStartISO = resolvedToIso;
    }
  }

  return next;
}

export function tryMergePendingCalendarUpdateReply(params: {
  pending: PendingCalendarUpdateContext;
  reply: string;
  referenceNow: Date;
}) {
  const reply = params.reply.trim();

  const awaitingMoveSelection =
    params.pending.action === 'move' &&
    Boolean(params.pending.candidates && params.pending.candidates.length > 0);

  if (!reply || (!awaitingMoveSelection && isCalendarExactTimeReadQuery(reply))) {
    return null;
  }

  if (params.pending.candidates && params.pending.candidates.length > 0) {
    const locale = inferCalendarDisambiguationLocale({
      sourceTranscript: params.pending.sourceTranscript,
    });
    const selected = resolveDisambiguationSelection({
      reply,
      candidates: params.pending.candidates,
      referenceNow: params.referenceNow,
      locale,
      pendingTitle: params.pending.title,
    });

    if (selected) {
      const anchorFromISO = params.pending.fromStartISO ?? selected.startsAt;
      const next: PendingCalendarUpdateContext = {
        ...params.pending,
        selectedEventId: selected.eventId,
        title: selected.title,
        fromStartISO: anchorFromISO,
      };

      if (
        !next.toStartISO &&
        next.moveDeltaMs != null &&
        Number.isFinite(next.moveDeltaMs) &&
        anchorFromISO
      ) {
        const fromMs = Date.parse(anchorFromISO);

        if (Number.isFinite(fromMs)) {
          next.toStartISO = new Date(fromMs + next.moveDeltaMs).toISOString();
        }
      }

      if (!next.toStartISO) {
        const resolvedToStartISO = resolvePendingUpdateTargetStartISO({
          pending: params.pending,
          selectedStartISO: selected.startsAt,
          referenceNow: params.referenceNow,
        });

        if (resolvedToStartISO) {
          next.toStartISO = resolvedToStartISO;
        }
      }

      logCalendarPendingActionResolved({
        action: 'move',
        selectedEventId: selected.eventId,
        fromStartISO: next.fromStartISO,
        toStartISO: next.toStartISO,
        replyPreview: reply.slice(0, 120),
        sourceTranscriptPreview: params.pending.sourceTranscript.slice(0, 120),
      });

      return {
        context: next,
        transcript: params.pending.sourceTranscript.trim(),
        selectedEventId: selected.eventId,
        readyToExecute: Boolean(next.toStartISO && next.fromStartISO),
      };
    }

    return null;
  }

  const isTimeOnly = TIME_ONLY_REPLY.test(reply) || BARE_HOUR_REPLY.test(reply);

  if (!isTimeOnly) {
    const combinedPreview = `${params.pending.sourceTranscript} ${reply}`.replace(/\s+/g, ' ').trim();
    const previewExtraction = extractCalendarUpdateParameters(combinedPreview, params.referenceNow);
    const improvesContext =
      (previewExtraction.title && !params.pending.title) ||
      (previewExtraction.fromStartISO && !params.pending.fromStartISO) ||
      (previewExtraction.toStartISO && !params.pending.toStartISO) ||
      (previewExtraction.readyToExecute && !params.pending.toStartISO);

    if (
      !improvesContext &&
      !(SCHEDULE_FOLLOWUP_REPLY.test(reply) && (params.pending.title || params.pending.sourceTranscript))
    ) {
      return null;
    }
  }

  let next: PendingCalendarUpdateContext = {
    ...params.pending,
    title: params.pending.title,
    fromStartISO: params.pending.fromStartISO,
    toStartISO: params.pending.toStartISO,
  };

  const timeOnly = reply.match(TIME_ONLY_REPLY);
  const bareHour = reply.match(BARE_HOUR_REPLY);

  if (timeOnly) {
    next = applyClockReplyToPendingContext({
      pending: next,
      clockLabel: timeOnly[1],
      referenceNow: params.referenceNow,
    });
  } else if (bareHour) {
    next = applyClockReplyToPendingContext({
      pending: next,
      clockLabel: `${bareHour[1].padStart(2, '0')}:00`,
      referenceNow: params.referenceNow,
    });
  } else {
    const combined = params.pending.title
      ? `Перенеси ${params.pending.title} ${reply}`.replace(/\s+/g, ' ').trim()
      : `${params.pending.sourceTranscript} ${reply}`.replace(/\s+/g, ' ').trim();
    const extraction = extractCalendarUpdateParameters(combined, params.referenceNow);

    next.title = extraction.title ?? next.title;
    next.fromStartISO = extraction.fromStartISO ?? next.fromStartISO;
    next.toStartISO = extraction.toStartISO ?? next.toStartISO;
    next.sourceTranscript = combined;
  }

  const transcript = buildTranscriptFromPendingContext(next);
  const verification = extractCalendarUpdateParameters(transcript, params.referenceNow);

  next.title = verification.title ?? next.title;
  next.fromStartISO = verification.fromStartISO ?? next.fromStartISO;
  next.toStartISO = verification.toStartISO ?? next.toStartISO;

  logUpdateClarificationMerged({
    replyPreview: reply.slice(0, 80),
    title: next.title,
    fromStartISO: next.fromStartISO,
    toStartISO: next.toStartISO,
    transcriptPreview: transcript.slice(0, 160),
    readyToExecute: verification.readyToExecute,
  });

  return {
    context: next,
    transcript,
    readyToExecute: verification.readyToExecute,
  };
}
