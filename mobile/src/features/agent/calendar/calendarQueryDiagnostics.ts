export function logCalendarQueryResolution(payload: {
  original_user_query: string;
  parsed_time_minutes: number | null;
  parsed_time_label: string | null;
  timezone_used: string;
  events_found: Array<{ id: string; title: string; startsAt: string }>;
  calendar_refresh_status: 'skipped' | 'ok' | 'failed';
  calendarStore_count: number;
  live_store_count: number;
  remote_fetch_count: number;
}) {
  console.log('[CALENDAR QUERY]');
  console.log(JSON.stringify(payload));
}
