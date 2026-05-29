import { extractCalendarCommand } from '@/src/features/agent/calendar/calendarCommandExtractor';
import { logCalendarCreate } from '@/src/features/agent/execution/calendarCreateLogger';

/** @deprecated Prefer extractCalendarCommand — kept for delete matching and legacy callers. */
export function extractCalendarEventTitle(transcript: string, referenceNow: Date = new Date()) {
  logCalendarCreate('raw user text', { transcript });

  const extraction = extractCalendarCommand({
    transcript,
    referenceNow,
  });

  if (!extraction.title) {
    logCalendarCreate('extracted title', { extracted: '', ok: false, reason: 'semantic_extraction_empty' });
    return '';
  }

  logCalendarCreate('extracted title', {
    extracted: extraction.title,
    confidence: extraction.confidence,
    cleanedCommand: extraction.cleanedCommand.slice(0, 120),
  });

  return extraction.title;
}
