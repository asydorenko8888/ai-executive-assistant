import {
  enrichTranscriptWhenPendingConflictActive,
  getActivePendingConflictAction,
  isExplicitDifferentCalendarCommand,
  resolvePendingEventReferences,
} from '@/src/features/agent/calendar/calendarPendingConflictEnrichment';
import { extractCreateEventTitle } from '@/src/features/agent/calendar/calendarCreateIntentExtractor';
import { extractUpdateEventTitle } from '@/src/features/agent/calendar/calendarUpdateIntentExtractor';
import { EVENT_PRONOUN_REFERENCE, isIgnorableTitleQueryForMemory } from '@/src/features/agent/calendar/calendarEventReferenceTokens';
import {
  getActiveCalendarEventRecord,
  resolveRecurringSeriesReference,
} from '@/src/features/agent/calendar/calendarConversationEventMemory';
import { extractCalendarClockFragment } from '@/src/features/agent/calendarIntelligence/calendarClockParser';
import {
  isOperationalCalendarCreateRequest,
  isOperationalCalendarUpdateRequest,
} from '@/src/features/agent/intent/operationalCalendarWriteDetection';

const PRONOUN_REFERENCE = EVENT_PRONOUN_REFERENCE;

const IMPLICIT_REFERENCE_UPDATE =
  /^(?:please\s+)?(?:перенеси|перенести|move|reschedule|shift|сдвинь|сдвинуть)\b/iu;

const IMPLICIT_REFERENCE_DELETE =
  /^(?:please\s+)?(?:удали|удалить|видали|видалити|delete|remove|cancel)\b/iu;

const RELATIVE_SHIFT_HINT =
  /(?:^|[\s,.;:!?—-]+)(?:через|in)\s+\d+\s*(?:минут|minutes|мин|хвилин|час|hours|годин)|(?:на|by)\s+\d{1,2}:\d{2}\s+(?:позже|пізніше|later|раньше|раніше|earlier)|(?:на|by)\s+\d+\s*(?:час|hours|годин|годину|хвилин(?:и|у)?)|\d+\s*(?:час(?:а|ов)?|hours?|годин(?:и|у)?|хвилин(?:и|у)?)\s+(?:позже|пізніше|later|раньше|раніше|earlier)|(?:пізніше|раніше|later|earlier)/iu;

function hasExplicitClockOrDay(transcript: string) {
  return (
    extractCalendarClockFragment(transcript) !== null ||
    /\b(?:today|tomorrow|завтра|сьогодні|сегодня|післязавтра|послезавтра|monday|tuesday|wednesday|thursday|friday|saturday|sunday|понедельник|вторник|сред|четверг|пятниц|суббот|воскрес)\b/iu.test(
      transcript,
    )
  );
}

function extractNamedTargetTitle(transcript: string) {
  if (IMPLICIT_REFERENCE_UPDATE.test(transcript) || isOperationalCalendarUpdateRequest(transcript)) {
    return extractUpdateEventTitle(transcript);
  }

  return extractCreateEventTitle(transcript);
}

function hasExplicitNamedTarget(transcript: string) {
  const title = (extractNamedTargetTitle(transcript) ?? '').trim();

  if (
    title.length >= 3 &&
    !PRONOUN_REFERENCE.test(title) &&
    !isIgnorableTitleQueryForMemory(title)
  ) {
    return true;
  }

  if (
    IMPLICIT_REFERENCE_UPDATE.test(transcript) ||
    isOperationalCalendarUpdateRequest(transcript)
  ) {
    return false;
  }

  const withoutVerbs = transcript
    .replace(
      /^(?:please\s+)?(?:внеси|добав(?:ь|ьте|ить)|создай|запланируй|додай|створи|add|create|schedule|перенеси|move|удали|delete)\s+/iu,
      '',
    )
    .trim();

  if (withoutVerbs.length < 3) {
    return false;
  }

  if (PRONOUN_REFERENCE.test(withoutVerbs.split(/\s+/).slice(0, 3).join(' '))) {
    return false;
  }

  return /\p{L}{3,}/u.test(withoutVerbs);
}

export function hasExplicitEventTitleAndTime(transcript: string) {
  return hasExplicitNamedTarget(transcript) && hasExplicitClockOrDay(transcript);
}

function needsConversationEventContext(transcript: string) {
  if (PRONOUN_REFERENCE.test(transcript)) {
    return true;
  }

  if (RELATIVE_SHIFT_HINT.test(transcript)) {
    return true;
  }

  if (IMPLICIT_REFERENCE_UPDATE.test(transcript) && !hasExplicitNamedTarget(transcript)) {
    return true;
  }

  if (IMPLICIT_REFERENCE_DELETE.test(transcript) && !hasExplicitNamedTarget(transcript)) {
    return true;
  }

  if (hasExplicitClockOrDay(transcript) && !hasExplicitNamedTarget(transcript)) {
    return true;
  }

  return false;
}

function buildEnrichedTranscript(transcript: string, title: string, eventId?: string) {
  const normalized = transcript.trim();
  const quotedTitle = title.includes(' ') ? `"${title}"` : title;

  let resolved = resolvePendingEventReferences(normalized, title);
  resolved = resolved.replace(/\b(?:it|this|that|them|him|her)\b/giu, quotedTitle);

  if (IMPLICIT_REFERENCE_UPDATE.test(normalized) || isOperationalCalendarUpdateRequest(normalized)) {
    if (PRONOUN_REFERENCE.test(normalized) || !extractUpdateEventTitle(normalized)) {
      if (!resolved.toLowerCase().includes(title.toLowerCase())) {
        return `${resolved} ${quotedTitle}`.replace(/\s+/g, ' ').trim();
      }

      return resolved;
    }
  }

  if (IMPLICIT_REFERENCE_DELETE.test(normalized)) {
    return `${resolved} ${quotedTitle}`.replace(/\s+/g, ' ').trim();
  }

  if (isOperationalCalendarCreateRequest(normalized) && PRONOUN_REFERENCE.test(normalized)) {
    return resolved;
  }

  if (!resolved.toLowerCase().includes(title.toLowerCase())) {
    return `${resolved} ${quotedTitle}`.replace(/\s+/g, ' ').trim();
  }

  return resolved;
}

export function enrichCalendarCommandTranscript(params: {
  transcript: string;
  referenceNow: Date;
}) {
  const normalized = params.transcript.trim();

  if (!normalized) {
    return normalized;
  }

  const pending = getActivePendingConflictAction();

  if (pending && !isExplicitDifferentCalendarCommand(normalized, pending)) {
    const enriched = enrichTranscriptWhenPendingConflictActive(normalized);

    if (enriched && enriched !== normalized) {
      console.log('[PENDING CONFLICT CONTEXT BOUND]');
      console.log(
        JSON.stringify({
          pendingActionId: pending.pendingActionId,
          eventTitle: pending.eventTitle,
          from: normalized.slice(0, 100),
          to: enriched.slice(0, 140),
        }),
      );

      return enriched;
    }

    const withPronouns = resolvePendingEventReferences(normalized, pending.eventTitle);

    if (withPronouns !== normalized) {
      return withPronouns;
    }
  }

  const seriesRef = resolveRecurringSeriesReference(params.referenceNow);
  const memoryRef = getActiveCalendarEventRecord(params.referenceNow);
  const contextRef = memoryRef ?? (seriesRef
    ? {
        eventId: seriesRef.eventId,
        title: seriesRef.title,
        startISO: seriesRef.startISO,
        endISO: seriesRef.endISO,
        dateKey: '',
        savedAtMs: seriesRef.savedAtMs,
        source: 'create' as const,
        activeSource: 'last_created' as const,
      }
    : null);

  if (contextRef && needsConversationEventContext(normalized)) {
    const enriched = buildEnrichedTranscript(normalized, contextRef.title, contextRef.eventId);

    console.log('[CONVERSATION EVENT MEMORY USED]');
    console.log(
      JSON.stringify({
        eventId: contextRef.eventId,
        title: contextRef.title,
        source: contextRef.source,
        from: normalized.slice(0, 100),
        to: enriched.slice(0, 140),
      }),
    );

    return enriched;
  }

  if (hasExplicitEventTitleAndTime(normalized)) {
    return normalized;
  }

  if (!needsConversationEventContext(normalized)) {
    return normalized;
  }

  if (!contextRef) {
    return normalized;
  }

  return buildEnrichedTranscript(normalized, contextRef.title, contextRef.eventId);
}
