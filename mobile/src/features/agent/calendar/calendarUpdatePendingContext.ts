import {
  extractCalendarUpdateParameters,
  type CalendarUpdateExtractResult,
} from '@/src/features/agent/calendar/calendarUpdateIntentExtractor';
import { logUpdateClarificationMerged } from '@/src/features/agent/calendar/calendarUpdateLogger';
import type { PendingCalendarUpdateContext } from '@/src/features/agent/execution/calendarExecutionSession';

const TIME_ONLY_REPLY = /^(\d{1,2}:\d{2})$/;
const BARE_HOUR_REPLY = /^(\d{1,2})$/;

function usesCyrillicUpdateTemplate(sourceTranscript: string) {
  return /[а-яёіїєґ]/iu.test(sourceTranscript);
}

export function buildTranscriptFromPendingContext(context: PendingCalendarUpdateContext) {
  const title = context.title?.trim() ?? '';
  const fromTime = context.fromTime?.trim() ?? '';
  const toTime = context.toTime?.trim() ?? '';

  if (title && fromTime && toTime) {
    if (usesCyrillicUpdateTemplate(context.sourceTranscript)) {
      return `Перенеси ${title} с ${fromTime} на ${toTime}`;
    }

    return `Move ${title} from ${fromTime} to ${toTime}`;
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

export function pendingContextFromExtraction(params: {
  sourceTranscript: string;
  extraction: CalendarUpdateExtractResult;
}): PendingCalendarUpdateContext {
  return {
    operation: 'update',
    title: params.extraction.title,
    fromTime: params.extraction.fromTime,
    toTime: params.extraction.toTime,
    sourceTranscript: params.sourceTranscript.trim(),
  };
}

export function tryMergePendingCalendarUpdateReply(params: {
  pending: PendingCalendarUpdateContext;
  reply: string;
  referenceNow: Date;
}) {
  const reply = params.reply.trim();

  if (!reply) {
    return null;
  }

  const isTimeOnly = TIME_ONLY_REPLY.test(reply) || BARE_HOUR_REPLY.test(reply);

  if (!isTimeOnly) {
    const combinedPreview = `${params.pending.sourceTranscript} ${reply}`.replace(/\s+/g, ' ').trim();
    const previewExtraction = extractCalendarUpdateParameters(combinedPreview, params.referenceNow);
    const improvesContext =
      (previewExtraction.title && !params.pending.title) ||
      (previewExtraction.fromTime && !params.pending.fromTime) ||
      (previewExtraction.toTime && !params.pending.toTime);

    if (!improvesContext) {
      return null;
    }
  }

  const next: PendingCalendarUpdateContext = {
    ...params.pending,
    title: params.pending.title,
    fromTime: params.pending.fromTime,
    toTime: params.pending.toTime,
  };

  const timeOnly = reply.match(TIME_ONLY_REPLY);
  const bareHour = reply.match(BARE_HOUR_REPLY);

  if (timeOnly) {
    if (!next.toTime) {
      next.toTime = timeOnly[1];
    } else if (!next.fromTime) {
      next.fromTime = timeOnly[1];
    } else {
      next.toTime = timeOnly[1];
    }
  } else if (bareHour) {
    const normalized = `${bareHour[1].padStart(2, '0')}:00`;

    if (!next.toTime) {
      next.toTime = normalized;
    } else if (!next.fromTime) {
      next.fromTime = normalized;
    } else {
      next.toTime = normalized;
    }
  } else {
    const combined = `${params.pending.sourceTranscript} ${reply}`.replace(/\s+/g, ' ').trim();
    const extraction = extractCalendarUpdateParameters(combined, params.referenceNow);

    next.title = extraction.title ?? next.title;
    next.fromTime = extraction.fromTime ?? next.fromTime;
    next.toTime = extraction.toTime ?? next.toTime;
    next.sourceTranscript = combined;
  }

  const transcript = buildTranscriptFromPendingContext(next);
  const verification = extractCalendarUpdateParameters(transcript, params.referenceNow);

  next.title = verification.title ?? next.title;
  next.fromTime = verification.fromTime ?? next.fromTime;
  next.toTime = verification.toTime ?? next.toTime;

  logUpdateClarificationMerged({
    replyPreview: reply.slice(0, 80),
    title: next.title,
    fromTime: next.fromTime,
    toTime: next.toTime,
    transcriptPreview: transcript.slice(0, 160),
    readyToExecute: verification.readyToExecute,
  });

  return {
    context: next,
    transcript,
    readyToExecute: verification.readyToExecute,
  };
}
