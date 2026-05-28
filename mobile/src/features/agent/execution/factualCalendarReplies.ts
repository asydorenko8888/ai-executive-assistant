import type { CalendarToolResponse } from '@/src/features/agent/execution/calendarToolContract';

/** Factual only — no conversational fallback phrasing. */
export function buildFactualCalendarToolReplies(tool: CalendarToolResponse) {
  if (tool.status === 'SUCCESS') {
    const reply = tool.eventId ? `Event created. ID: ${tool.eventId}` : 'Event created.';

    return {
      reply,
      spokenReply: 'Event created.',
    };
  }

  if (tool.status === 'PENDING') {
    const code = tool.errorCode ?? 'PENDING';
    const text = `PENDING: ${code}`;

    return {
      reply: text,
      spokenReply: text,
    };
  }

  const code = tool.errorCode ?? 'UNKNOWN';
  const detail = tool.error ?? 'unknown error';
  const text = `FAILURE: ${code}: ${detail}`;

  return {
    reply: text,
    spokenReply: text,
  };
}
