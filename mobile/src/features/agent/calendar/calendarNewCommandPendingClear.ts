import type { CalendarPendingAction } from '@/src/features/agent/calendar/calendarConversationState';
import { extractDeleteEventTitle } from '@/src/features/agent/calendar/calendarDeleteIntentExtractor';
import {
  isExplicitDifferentCalendarCommand,
  titlesReferToSameEvent,
} from '@/src/features/agent/calendar/calendarPendingConflictEnrichment';
import { extractUpdateEventTitle } from '@/src/features/agent/calendar/calendarUpdateIntentExtractor';

export function shouldClearStalePendingForNewCommand(
  transcript: string,
  pending: CalendarPendingAction | null,
): boolean {
  if (!pending) {
    return false;
  }

  if (isExplicitDifferentCalendarCommand(transcript, pending)) {
    return true;
  }

  const updateTitle = extractUpdateEventTitle(transcript)?.trim();
  const deleteTitle = extractDeleteEventTitle(transcript)?.trim();
  const explicitTitle = updateTitle || deleteTitle;

  if (!explicitTitle || explicitTitle.length < 2) {
    return false;
  }

  return !titlesReferToSameEvent(explicitTitle, pending.eventTitle);
}
