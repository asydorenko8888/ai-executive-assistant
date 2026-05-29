/** JS \\b is ASCII-only — use explicit edges for Cyrillic calendar text. */
export const CALENDAR_WORD_EDGE = '(?:^|[\\s,.;:!?—\\-«»"\'(]+)';
export const CALENDAR_WORD_END = '(?:[\\s,.;:!?—\\-»"\'()]+|$)';

export const CALENDAR_CLOCK_PREPOSITION = '(?:в|на|о|к|at|@)';
