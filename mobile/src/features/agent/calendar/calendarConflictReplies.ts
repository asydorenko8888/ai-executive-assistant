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

function formatConflictTimeLabel(startMs: number, timeZone: string) {
  return formatTimeInExecutiveTimezone(new Date(startMs).toISOString(), timeZone);
}

/** Initial conflict warning for a move — asks the user to confirm, never refuses. */
export function buildCalendarUpdateConflictInitialReply(params: {
  locale: CalendarConflictLocale;
  proposedTitle: string;
  conflict: CalendarScheduleConflict;
  proposedStartMs: number;
  proposedEndMs: number;
}) {
  return buildCalendarScheduleConflictReply({
    locale: params.locale,
    operation: 'update',
    proposedTitle: params.proposedTitle,
    conflict: params.conflict,
    proposedStartMs: params.proposedStartMs,
    proposedEndMs: params.proposedEndMs,
  });
}

/** Shown after user confirms on an update conflict — event stays unchanged. */
export function buildCalendarUpdateConflictAlternativesOnlyReply(params: {
  locale: CalendarConflictLocale;
  proposedTitle: string;
  optionLabels: string[];
}) {
  const numbered = params.optionLabels.slice(0, 3).map((label, index) => `${index + 1}. ${label}`);

  const title = params.proposedTitle.trim() || 'Untitled';
  const slots =
    numbered.length > 0 ? `\n${numbered.join('\n')}` : '';

  if (params.locale === 'uk') {
    return `Гаразд, я не переносив «${title}». Можу запропонувати інший час:${slots}`;
  }

  if (params.locale === 'ru') {
    return `Ок, я не переносил «${title}». Могу предложить другое время:${slots}`;
  }

  return `Ok, I did not move ${title}. I can suggest another time:${slots}`;
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
  const requestedTime = formatConflictTimeLabel(params.proposedStartMs, timeZone);
  const title = params.proposedTitle.trim() || 'Untitled';

  if (params.locale === 'uk') {
    if (params.operation === 'update') {
      return `На ${requestedTime} уже є: «${conflictTitle}». Перенести «${title}» на ${requestedTime} все одно?`;
    }

    return `На ${requestedTime} уже є: «${conflictTitle}». Створити «${title}» на ${requestedTime} все одно?`;
  }

  if (params.locale === 'ru') {
    if (params.operation === 'update') {
      return `На ${requestedTime} уже занято: «${conflictTitle}». Перенести «${title}» на ${requestedTime} всё равно?`;
    }

    return `На ${requestedTime} уже занято: «${conflictTitle}». Создать «${title}» на ${requestedTime} всё равно?`;
  }

  if (params.operation === 'update') {
    return `At ${requestedTime} you already have: ${conflictTitle}. Move ${title} to ${requestedTime} anyway?`;
  }

  return `At ${requestedTime} you already have: ${conflictTitle}. Create ${title} at ${requestedTime} anyway?`;
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

function formatDuplicateConfirmationDayLabel(dayOffset: number, locale: CalendarConflictLocale) {
  if (dayOffset === 0) {
    if (locale === 'uk') {
      return 'сьогодні';
    }

    if (locale === 'ru') {
      return 'сегодня';
    }

    return 'today';
  }

  if (dayOffset === 1) {
    if (locale === 'uk') {
      return 'завтра';
    }

    if (locale === 'ru') {
      return 'завтра';
    }

    return 'tomorrow';
  }

  if (locale === 'uk') {
    return 'цей день';
  }

  if (locale === 'ru') {
    return 'этот день';
  }

  return 'that day';
}

export function buildCreateDuplicateTitleConfirmationReply(params: {
  locale: CalendarConflictLocale;
  dayOffset: number;
  existingTitle: string;
  existingStartMs: number;
  proposedTitle: string;
  proposedStartMs: number;
  exactDuplicate: boolean;
}) {
  const timeZone = getExecutiveCalendarTimezone();

  if (params.exactDuplicate) {
    if (params.locale === 'uk') {
      return 'Така подія вже є. Створити дубль?';
    }

    if (params.locale === 'ru') {
      return 'Такое событие уже есть. Создать дубль?';
    }

    return 'That event already exists. Create a duplicate?';
  }

  const dayLabel = formatDuplicateConfirmationDayLabel(params.dayOffset, params.locale);
  const existingTime = formatConflictTimeLabel(params.existingStartMs, timeZone);
  const proposedTime = formatConflictTimeLabel(params.proposedStartMs, timeZone);
  const existingTitle = params.existingTitle.trim() || params.proposedTitle.trim();
  const proposedTitle = params.proposedTitle.trim() || existingTitle;

  if (params.locale === 'uk') {
    return `На ${dayLabel} вже є «${existingTitle}» о ${existingTime}. Створити ще одну «${proposedTitle}» о ${proposedTime}?`;
  }

  if (params.locale === 'ru') {
    return `На ${dayLabel} уже есть «${existingTitle}» в ${existingTime}. Создать ещё одну «${proposedTitle}» в ${proposedTime}?`;
  }

  return `On ${dayLabel} you already have "${existingTitle}" at ${existingTime}. Create another "${proposedTitle}" at ${proposedTime}?`;
}

export function buildCalendarCreateConflictInitialReply(params: {
  locale: CalendarConflictLocale;
  proposedTitle: string;
  conflict: CalendarScheduleConflict;
  proposedStartMs: number;
  proposedEndMs: number;
}) {
  return buildCalendarScheduleConflictReply({
    locale: params.locale,
    operation: 'create',
    proposedTitle: params.proposedTitle,
    conflict: params.conflict,
    proposedStartMs: params.proposedStartMs,
    proposedEndMs: params.proposedEndMs,
  });
}

/** Shown after user declines — must not repeat the conflict warning. */
export function buildCalendarConflictAlternativesOnlyReply(params: {
  locale: CalendarConflictLocale;
  proposedTitle?: string;
  optionLabels: string[];
}) {
  const numbered = params.optionLabels.slice(0, 3).map((label, index) => `${index + 1}. ${label}`);
  const title = params.proposedTitle?.trim() || 'Untitled';
  const slots =
    numbered.length > 0 ? `\n${numbered.join('\n')}` : '';

  if (params.locale === 'uk') {
    return `Гаразд, я не створював «${title}». Можу запропонувати інший час:${slots}`;
  }

  if (params.locale === 'ru') {
    return `Ок, я не создавал «${title}». Могу предложить другое время:${slots}`;
  }

  return `Ok, I did not create ${title}. I can suggest another time:${slots}`;
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
