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

export function buildCalendarCreateConflictInitialReply(params: {
  locale: CalendarConflictLocale;
  proposedTitle: string;
  conflict: CalendarScheduleConflict;
}) {
  const timeZone = getExecutiveCalendarTimezone();
  const conflictTitle = params.conflict.event.title.trim() || 'Untitled';
  const conflictRange = formatConflictRange(
    params.conflict.startsAtMs,
    params.conflict.endsAtMs,
    timeZone,
  );
  const title = params.proposedTitle.trim() || 'Untitled';

  if (params.locale === 'uk') {
    return `На цей час уже є подія «${conflictTitle}» о ${conflictRange}. Створити «${title}» все одно?`;
  }

  if (params.locale === 'ru') {
    return `На это время уже есть событие «${conflictTitle}» на ${conflictRange}. Создать «${title}» всё равно?`;
  }

  return `There is already an event ${conflictTitle} at ${conflictRange}. Create ${title} anyway?`;
}

/** Shown after user declines force-create — must not repeat the conflict warning. */
export function buildCalendarConflictAlternativesOnlyReply(params: {
  locale: CalendarConflictLocale;
  optionLabels: string[];
}) {
  const numbered = params.optionLabels.slice(0, 3).map((label, index) => `${index + 1}. ${label}`);

  if (params.locale === 'uk') {
    return `Гаразд, не створюю поверх конфлікту. Можу запропонувати:\n${numbered.join('\n')}\nАбо назвіть свій час.`;
  }

  if (params.locale === 'ru') {
    return `Ок, не создаю поверх конфликта. Могу предложить:\n${numbered.join('\n')}\nИли назовите своё время.`;
  }

  return `Okay, I won't create over the conflict. I can suggest:\n${numbered.join('\n')}\nOr name your own time.`;
}

export function buildVagueConflictTimeClarificationReply(params: {
  locale: CalendarConflictLocale;
  optionLabels: string[];
}) {
  const numbered = params.optionLabels.slice(0, 3).map((label, index) => `${index + 1}. ${label}`);

  if (params.locale === 'uk') {
    return `Це не точний час. Назвіть конкретний час (наприклад, 14:00) або оберіть вікно:\n${numbered.join('\n')}`;
  }

  if (params.locale === 'ru') {
    return `Это не точное время. Назовите конкретное время (например, 14:00) или выберите окно:\n${numbered.join('\n')}`;
  }

  return `That is not a specific time. Name an exact time (for example, 2:00 PM) or pick a slot:\n${numbered.join('\n')}`;
}

export function formatConflictSlotLabelWithDay(params: {
  slot: CalendarFreeSlot;
  referenceNow: Date;
  locale: CalendarConflictLocale;
  timeZone?: string;
}) {
  const timeZone = params.timeZone ?? getExecutiveCalendarTimezone();
  const range = formatSlotRange(params.slot, timeZone);
  const startMs = Date.parse(params.slot.startISO);

  if (Number.isNaN(startMs)) {
    return range;
  }

  const dayOffset = resolveConflictDayOffset(startMs, params.referenceNow);

  if (dayOffset === 0) {
    if (params.locale === 'uk') {
      return `Сьогодні ${range}`;
    }

    if (params.locale === 'ru') {
      return `Сегодня ${range}`;
    }

    return `Today ${range}`;
  }

  if (dayOffset === 1) {
    if (params.locale === 'uk') {
      return `Завтра ${range}`;
    }

    if (params.locale === 'ru') {
      return `Завтра ${range}`;
    }

    return `Tomorrow ${range}`;
  }

  return range;
}

export function resolveConflictDayOffset(proposedStartMs: number, referenceNow: Date) {
  const timeZone = getExecutiveCalendarTimezone();
  const ref = getZonedTimeParts(referenceNow, timeZone);
  const target = getZonedTimeParts(new Date(proposedStartMs), timeZone);
  const refDay = Date.UTC(ref.year, ref.month - 1, ref.day);
  const targetDay = Date.UTC(target.year, target.month - 1, target.day);

  return Math.round((targetDay - refDay) / 86400000);
}
