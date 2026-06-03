import { zonedLocalToUtcMs } from '@/src/features/agent/calendar/calendarTimezone';
import type { CalendarDayContext } from '@/src/features/agent/calendarIntelligence/types';

/** Format civil clock minutes on the query day in the executive timezone (never UTC-shifted labels). */
export function formatWallClockLabel(clockMinutes: number, day: CalendarDayContext) {
  const hour = Math.floor(clockMinutes / 60);
  const minute = clockMinutes % 60;
  const ymd = {
    year: Number(day.dateKey.slice(0, 4)),
    month: Number(day.dateKey.slice(5, 7)),
    day: Number(day.dateKey.slice(8, 10)),
    hour,
    minute,
    second: 0,
  };
  const instantMs = zonedLocalToUtcMs(ymd, day.timezone);

  return new Date(instantMs).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: day.timezone,
  });
}
