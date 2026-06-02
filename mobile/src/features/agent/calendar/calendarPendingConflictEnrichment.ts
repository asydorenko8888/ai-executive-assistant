import { buildConflictFollowUpTranscript } from '@/src/features/agent/calendar/calendarPendingConflictResolution';
import type { CalendarPendingAction } from '@/src/features/agent/calendar/calendarConversationState';
import {
  getCalendarConversationSnapshot,
  isCalendarConflictDecisionState,
} from '@/src/features/agent/calendar/calendarConversationState';
import { extractCreateEventTitle } from '@/src/features/agent/calendar/calendarCreateIntentExtractor';
import { CREATE_COMMAND_PREFIX } from '@/src/features/agent/calendar/calendarCreateIntentExtractor';
import { isPendingConflictScheduleUpdateReply } from '@/src/features/agent/calendar/calendarPendingConflictScheduleUpdate';
import { EVENT_PRONOUN_REFERENCE } from '@/src/features/agent/calendar/calendarEventReferenceTokens';
import { isTemporalOnlyTitle } from '@/src/features/agent/calendar/calendarTemporalWords';
import { isBareCalendarShortReply } from '@/src/features/agent/calendar/calendarShortReply';
import {
  isOperationalCalendarCreateRequest,
  isOperationalCalendarDeleteRequest,
  isOperationalCalendarUpdateRequest,
} from '@/src/features/agent/intent/operationalCalendarWriteDetection';

const PENDING_EVENT_PRONOUN = EVENT_PRONOUN_REFERENCE;

const CYRILLIC_PRONOUN_TOKEN =
  /^(?:его|её|ее|их|її|їх|його|неї|нею|цю|цей|це|той|та|те)$/iu;

export function getActivePendingConflictAction(): CalendarPendingAction | null {
  const snapshot = getCalendarConversationSnapshot();

  if (!isCalendarConflictDecisionState(snapshot.state) || !snapshot.pendingAction) {
    return null;
  }

  return snapshot.pendingAction;
}

export function isActivePendingConflictWorkflow() {
  return getActivePendingConflictAction() !== null;
}

function normalizeTitleKey(title: string) {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\d]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function titlesReferToSameEvent(a: string, b: string) {
  const left = normalizeTitleKey(a);
  const right = normalizeTitleKey(b);

  if (!left || !right) {
    return false;
  }

  return left === right || left.includes(right) || right.includes(left);
}

export function isPendingEventPronounReference(transcript: string) {
  return PENDING_EVENT_PRONOUN.test(transcript.trim());
}

export function referencesPendingEventTitle(transcript: string, pendingTitle: string) {
  const normalized = transcript.trim();
  const titleKey = normalizeTitleKey(pendingTitle);
  const transcriptKey = normalizeTitleKey(normalized);

  if (!transcriptKey || !titleKey) {
    return false;
  }

  if (transcriptKey === titleKey || transcriptKey.includes(titleKey) || titleKey.includes(transcriptKey)) {
    return true;
  }

  const titleTokens = titleKey.split(/\s+/).filter((token) => token.length >= 3);

  return titleTokens.some((token) => transcriptKey.includes(token));
}

function stripCreateVerbPrefix(transcript: string) {
  return transcript.replace(CREATE_COMMAND_PREFIX, '').replace(/\s+/g, ' ').trim();
}

function extractFollowUpScheduleFragment(transcript: string, pendingTitle: string) {
  const normalized = transcript.trim();
  let fragment = stripCreateVerbPrefix(normalized);

  const titleKey = normalizeTitleKey(pendingTitle);

  if (titleKey) {
    const pattern = new RegExp(
      `(?:^|[\\s,.;:!?—-])${titleKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[\\s,.;:!?—-]|$)`,
      'iu',
    );
    fragment = fragment.replace(pattern, ' ').replace(/\s+/g, ' ').trim();
  }

  fragment = fragment.replace(PENDING_EVENT_PRONOUN, ' ').replace(/\s+/g, ' ').trim();

  return fragment || normalized;
}

export function resolvePendingEventReferences(transcript: string, pendingTitle: string) {
  const normalized = transcript.trim();
  const quotedTitle = pendingTitle.includes(' ') ? `"${pendingTitle}"` : pendingTitle;

  if (!PENDING_EVENT_PRONOUN.test(normalized)) {
    return normalized;
  }

  let resolved = normalized.replace(/^(?:его|её|ее|их)(?=[\s,.;:!?—-]|$)/iu, quotedTitle);
  resolved = resolved.replace(
    /([\s,.;:!?—-])(?:его|её|ее|их)(?=[\s,.;:!?—-]|$)/giu,
    `$1${quotedTitle}`,
  );

  resolved = resolved.replace(/\b(?:it|this|that|them|him|her)\b/giu, quotedTitle);
  resolved = resolved.replace(
    /(?:эту\s+встречу|эту\s+запись|это\s+событие|this\s+event|that\s+event)/giu,
    quotedTitle,
  );

  if (CYRILLIC_PRONOUN_TOKEN.test(resolved)) {
    resolved = quotedTitle;
  }

  return resolved.replace(/\s+/g, ' ').trim();
}

/**
 * True only when the user clearly starts a different calendar operation or names another event.
 */
export function isExplicitDifferentCalendarCommand(
  transcript: string,
  pending: CalendarPendingAction,
) {
  const normalized = transcript.trim();

  if (!normalized) {
    return false;
  }

  if (isPendingConflictScheduleUpdateReply(normalized)) {
    return false;
  }

  if (isOperationalCalendarDeleteRequest(normalized) || isOperationalCalendarUpdateRequest(normalized)) {
    return true;
  }

  const extractedTitle = extractCreateEventTitle(normalized)?.trim() ?? '';

  if (!extractedTitle || extractedTitle.length < 2) {
    return false;
  }

  if (isTemporalOnlyTitle(extractedTitle) || isPendingEventPronounReference(extractedTitle)) {
    return false;
  }

  const startsNewCreate =
    isOperationalCalendarCreateRequest(normalized) || CREATE_COMMAND_PREFIX.test(normalized);

  if (!startsNewCreate) {
    return false;
  }

  return !titlesReferToSameEvent(extractedTitle, pending.eventTitle);
}

export function shouldBindReplyToPendingConflict(
  transcript: string,
  pending: CalendarPendingAction,
) {
  const normalized = transcript.trim();

  if (!normalized || isExplicitDifferentCalendarCommand(normalized, pending)) {
    return false;
  }

  return true;
}

export function enrichTranscriptForActivePendingConflict(
  transcript: string,
  pending: CalendarPendingAction,
) {
  const normalized = transcript.trim();

  if (!normalized || !shouldBindReplyToPendingConflict(normalized, pending)) {
    return normalized;
  }

  if (isBareCalendarShortReply(normalized)) {
    return normalized;
  }

  const withResolvedReferences = resolvePendingEventReferences(normalized, pending.eventTitle);
  const scheduleFragment = extractFollowUpScheduleFragment(withResolvedReferences, pending.eventTitle);

  return buildConflictFollowUpTranscript(pending, scheduleFragment);
}

export function enrichTranscriptWhenPendingConflictActive(transcript: string) {
  const pending = getActivePendingConflictAction();

  if (!pending) {
    return null;
  }

  return enrichTranscriptForActivePendingConflict(transcript, pending);
}
