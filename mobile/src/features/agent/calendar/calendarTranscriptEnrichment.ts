import { extractCreateEventTitle } from '@/src/features/agent/calendar/calendarCreateIntentExtractor';
import { extractCalendarClockFragment } from '@/src/features/agent/calendarIntelligence/calendarClockParser';
import { getLastCalendarEventContext } from '@/src/features/agent/calendar/calendarLastEventContext';
import {
  isOperationalCalendarCreateRequest,
  isOperationalCalendarUpdateRequest,
} from '@/src/features/agent/intent/operationalCalendarWriteDetection';

const PRONOUN_REFERENCE =
  /\b(?:его|её|ее|их|it|this|that|him|her|them)\b|(?:^|[\s,.;:!?—-]+)(?:перенеси|перенести|удали|удалить|видали|видалити|move|reschedule|delete|remove)\s+(?:его|её|ее|it|this)(?:[\s,.;:!?—-]|$)/iu;

const IMPLICIT_REFERENCE_UPDATE =
  /^(?:please\s+)?(?:перенеси|перенести|move|reschedule|shift|сдвинь|сдвинуть)\b/iu;

const IMPLICIT_REFERENCE_DELETE =
  /^(?:please\s+)?(?:удали|удалить|видали|видалити|delete|remove|cancel)\b/iu;

function hasExplicitClockOrDay(transcript: string) {
  return (
    extractCalendarClockFragment(transcript) !== null ||
    /\b(?:today|tomorrow|завтра|сьогодні|сегодня|післязавтра|послезавтра|monday|tuesday|wednesday|thursday|friday|saturday|sunday|понедельник|вторник|сред|четверг|пятниц|суббот|воскрес)\b/iu.test(
      transcript,
    )
  );
}

function hasExplicitNamedTarget(transcript: string) {
  const title = (extractCreateEventTitle(transcript) ?? '').trim();

  if (title.length >= 3 && !PRONOUN_REFERENCE.test(title)) {
    return true;
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

  if (PRONOUN_REFERENCE.test(withoutVerbs.split(/\s+/).slice(0, 2).join(' '))) {
    return false;
  }

  return /\p{L}{3,}/u.test(withoutVerbs);
}

export function hasExplicitEventTitleAndTime(transcript: string) {
  return hasExplicitNamedTarget(transcript) && hasExplicitClockOrDay(transcript);
}

function needsLastEventContext(transcript: string) {
  if (PRONOUN_REFERENCE.test(transcript)) {
    return true;
  }

  if (IMPLICIT_REFERENCE_UPDATE.test(transcript) && !hasExplicitNamedTarget(transcript)) {
    return true;
  }

  if (IMPLICIT_REFERENCE_DELETE.test(transcript) && !hasExplicitNamedTarget(transcript)) {
    return true;
  }

  return false;
}

function buildEnrichedTranscript(transcript: string, title: string) {
  const normalized = transcript.trim();
  const quotedTitle = title.includes(' ') ? `"${title}"` : title;

  if (IMPLICIT_REFERENCE_UPDATE.test(normalized) || isOperationalCalendarUpdateRequest(normalized)) {
    if (/\b(?:его|её|ее|it|this)\b/iu.test(normalized)) {
      return normalized
        .replace(/\b(?:его|её|ее|it|this)\b/iu, quotedTitle)
        .replace(/\s+/g, ' ')
        .trim();
    }

    return `${normalized} ${quotedTitle}`.replace(/\s+/g, ' ').trim();
  }

  if (IMPLICIT_REFERENCE_DELETE.test(normalized)) {
    return `${normalized} ${quotedTitle}`.replace(/\s+/g, ' ').trim();
  }

  if (isOperationalCalendarCreateRequest(normalized) && PRONOUN_REFERENCE.test(normalized)) {
    return normalized.replace(PRONOUN_REFERENCE, quotedTitle).replace(/\s+/g, ' ').trim();
  }

  return `${normalized} ${quotedTitle}`.replace(/\s+/g, ' ').trim();
}

export function enrichCalendarCommandTranscript(params: {
  transcript: string;
  referenceNow: Date;
}) {
  const normalized = params.transcript.trim();

  if (!normalized) {
    return normalized;
  }

  if (hasExplicitEventTitleAndTime(normalized)) {
    return normalized;
  }

  if (!needsLastEventContext(normalized)) {
    return normalized;
  }

  const last = getLastCalendarEventContext(params.referenceNow);

  if (!last) {
    return normalized;
  }

  console.log('[LAST EVENT CONTEXT USED]');
  console.log(
    JSON.stringify({
      eventId: last.eventId,
      title: last.title,
      actionType: last.actionType,
      transcriptPreview: normalized.slice(0, 120),
    }),
  );

  return buildEnrichedTranscript(normalized, last.title);
}
