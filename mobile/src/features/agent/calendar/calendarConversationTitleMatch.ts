import { normalizeCalendarEventTitle } from '@/src/features/agent/calendar/calendarEventTitleNormalization';

function normalizeTitleKey(title: string) {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\d]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function unifyCyrillicScript(key: string) {
  return key.replace(/[іїєґ]/gu, (char) => {
    switch (char) {
      case 'ї':
      case 'є':
        return 'и';
      case 'ґ':
        return 'г';
      default:
        return 'и';
    }
  });
}

function conversationTitleMatchKey(title: string) {
  const normalizedTitle = normalizeCalendarEventTitle(title.trim());
  const key = unifyCyrillicScript(normalizeTitleKey(normalizedTitle));

  return key || unifyCyrillicScript(normalizeTitleKey(title));
}

/**
 * Whether two titles refer to the same conversational event (RU/UA variants, accusative forms).
 */
export function calendarConversationTitlesMatch(a: string, b: string) {
  const left = conversationTitleMatchKey(a);
  const right = conversationTitleMatchKey(b);

  if (!left || !right) {
    return false;
  }

  return left === right || left.includes(right) || right.includes(left);
}
