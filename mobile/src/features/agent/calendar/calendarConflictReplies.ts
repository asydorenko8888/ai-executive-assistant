import type { CalendarScheduleConflict } from '@/src/features/agent/calendar/calendarScheduleConflictCore';
import type { CalendarFreeSlot } from '@/src/features/agent/calendarIntelligence/types';
import {
  getExecutiveCalendarTimezone,
  getZonedTimeParts,
} from '@/src/features/agent/calendar/calendarTimezone';
import { formatTimeInExecutiveTimezone } from '@/src/features/agent/calendar/calendarTime';

export type CalendarConflictLocale = 'ru' | 'en' | 'uk';

function formatConflictRange(startMs: number, endMs: number, timeZone: string) {
  const startLabel = formatTimeInExecutiveTimezone(new Date(startMs).toISOString(), timeZone);
  const endLabel = formatTimeInExecutiveTimezone(new Date(endMs).toISOString(), timeZone);

  return `${startLabel}–${endLabel}`;
}

function formatSlotRange(slot: CalendarFreeSlot, timeZone: string) {
  const startLabel = formatTimeInExecutiveTimezone(slot.startISO, timeZone);
  const endLabel = formatTimeInExecutiveTimezone(slot.endISO, timeZone);

  return `${startLabel}–${endLabel}`;
}

export function buildCalendarScheduleConflictReply(params: {
  locale: CalendarConflictLocale;
  operation: 'create' | 'update';
  proposedTitle: string;
  conflict: CalendarScheduleConflict;
  proposedStartMs: number;
  proposedEndMs: number;
}) {
  const timeZone = getExecutiveCalendarTimezone();
  const conflictTitle = params.conflict.event.title.trim() || 'Untitled';
  const conflictRange = formatConflictRange(
    params.conflict.startsAtMs,
    params.conflict.endsAtMs,
    timeZone,
  );
  const proposedRange = formatConflictRange(
    params.proposedStartMs,
    params.proposedEndMs,
    timeZone,
  );

  if (params.locale === 'uk') {
    if (params.operation === 'update') {
      return `У вас уже є подія «${conflictTitle}» (${conflictRange}). Усе одно перенести «${params.proposedTitle}» на ${proposedRange}?`;
    }

    return `На цей час уже є подія «${conflictTitle}» (${conflictRange}). Усе одно створити «${params.proposedTitle}» о ${proposedRange}?`;
  }

  if (params.locale === 'ru') {
    if (params.operation === 'update') {
      return `У вас уже есть событие «${conflictTitle}» (${conflictRange}). Всё равно перенести «${params.proposedTitle}» на ${proposedRange}?`;
    }

    return `На это время уже есть событие «${conflictTitle}» (${conflictRange}). Всё равно создать «${params.proposedTitle}» на ${proposedRange}?`;
  }

  if (params.operation === 'update') {
    return `You already have ${conflictTitle} from ${conflictRange}. Do you still want to move ${params.proposedTitle} to ${proposedRange}?`;
  }

  return `There is already an event at this time: ${conflictTitle}, ${conflictRange}. Do you still want to schedule ${params.proposedTitle} at ${proposedRange}?`;
}

export function buildCalendarConflictCancelledReply(locale: CalendarConflictLocale) {
  if (locale === 'uk') {
    return 'Добре, я нічого не змінював у календарі.';
  }

  if (locale === 'ru') {
    return 'Хорошо, я ничего не менял в календаре.';
  }

  return 'Okay, I did not change your calendar.';
}

export function buildCalendarConflictFreeSlotsReply(params: {
  locale: CalendarConflictLocale;
  slots: CalendarFreeSlot[];
  durationMinutes: number;
  dayOffset: number;
}) {
  const timeZone = getExecutiveCalendarTimezone();

  if (params.slots.length === 0) {
    if (params.locale === 'uk') {
      return `На цей день немає вільного вікна на ${params.durationMinutes} хвилин.`;
    }

    if (params.locale === 'ru') {
      return `На этот день нет свободного окна на ${params.durationMinutes} минут.`;
    }

    return `No free ${params.durationMinutes}-minute slots are available on that day.`;
  }

  const top = params.slots.slice(0, 3).map((slot, index) => {
    const label = formatSlotRange(slot, timeZone);

    return `${index + 1}. ${label}`;
  });

  if (params.locale === 'uk') {
    return `Найближчі вільні вікна:\n${top.join('\n')}\nСкажіть «так», щоб лишити як є, або назвіть інший час.`;
  }

  if (params.locale === 'ru') {
    return `Ближайшие свободные окна:\n${top.join('\n')}\nСкажите «да», чтобы оставить как есть, или назовите другое время.`;
  }

  return `Nearest free slots:\n${top.join('\n')}\nSay "yes" to keep the requested time anyway, or pick another time.`;
}

export function resolveConflictDayOffset(proposedStartMs: number, referenceNow: Date) {
  const timeZone = getExecutiveCalendarTimezone();
  const ref = getZonedTimeParts(referenceNow, timeZone);
  const target = getZonedTimeParts(new Date(proposedStartMs), timeZone);
  const refDay = Date.UTC(ref.year, ref.month - 1, ref.day);
  const targetDay = Date.UTC(target.year, target.month - 1, target.day);

  return Math.round((targetDay - refDay) / 86400000);
}
