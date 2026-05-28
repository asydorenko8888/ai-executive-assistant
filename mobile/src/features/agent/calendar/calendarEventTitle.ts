const SMALL_WORDS = new Set([
  'a',
  'an',
  'and',
  'at',
  'for',
  'in',
  'of',
  'on',
  'or',
  'the',
  'to',
  'vs',
  'with',
]);

function capitalizeWord(word: string) {
  if (!word) {
    return word;
  }

  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function toDisplayTitleCase(title: string) {
  const words = title.split(/\s+/).filter(Boolean);

  return words
    .map((word, index) => {
      const normalized = word.toLowerCase();

      if (index > 0 && SMALL_WORDS.has(normalized)) {
        return normalized;
      }

      if (/^[A-Z0-9]{2,}$/.test(word)) {
        return word;
      }

      return capitalizeWord(word);
    })
    .join(' ');
}

export function humanizeCalendarEventTitle(rawTitle: string) {
  let title = rawTitle.trim();

  if (!title) {
    return 'Untitled event';
  }

  title = title.replace(/^(copy of|duplicate of|fwd:|re:)\s+/gi, '');
  title = title.replace(/\s*\((copy|duplicate)\)\s*$/gi, '');
  title = title.replace(/\b(final)(\s+\1)+\b/gi, 'final');
  title = title.replace(/\s+v\d+$/i, '');
  title = title.replace(/([a-zA-Z])(\d+)\b/g, '$1 $2');
  title = title.replace(/\s+/g, ' ').trim();

  if (/^test\s+/i.test(title) && title.split(/\s+/).length <= 3) {
    title = title.replace(/^test\s+/i, '');
  }

  if (title.length <= 48) {
    title = toDisplayTitleCase(title);
  } else {
    title = capitalizeWord(title);
  }

  return title || 'Untitled event';
}
