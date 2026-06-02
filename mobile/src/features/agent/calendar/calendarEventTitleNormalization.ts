const ACCUSATIVE_TO_NOMINATIVE: Array<{ pattern: RegExp; replace: string }> = [
  { pattern: /^стоматолога$/iu, replace: 'Стоматолог' },
  { pattern: /^медитацию$/iu, replace: 'Медитация' },
  { pattern: /^медитаци[яю]$/iu, replace: 'Медитация' },
  { pattern: /^массажиста$/iu, replace: 'Массаж' },
  { pattern: /^терапевта$/iu, replace: 'Терапевт' },
  { pattern: /^тренировку$/iu, replace: 'Тренировка' },
  { pattern: /^встречу$/iu, replace: 'Встреча' },
  { pattern: /^прогулку$/iu, replace: 'Прогулка' },
  { pattern: /^переговоры$/iu, replace: 'Переговоры' },
  { pattern: /^переговоров$/iu, replace: 'Переговоры' },
  { pattern: /^ужин$/iu, replace: 'Ужин' },
  { pattern: /^завтрак$/iu, replace: 'Завтрак' },
  { pattern: /^обед$/iu, replace: 'Обед' },
  { pattern: /^врача$/iu, replace: 'Врач' },
  { pattern: /^звонок$/iu, replace: 'Звонок' },
];

const TITLE_MINOR_WORDS = new Set([
  'a',
  'an',
  'the',
  'with',
  'and',
  'or',
  'for',
  'to',
  'of',
  'in',
  'on',
  'at',
  'с',
  'з',
  'із',
  'i',
  'у',
  'в',
  'на',
  'о',
  'и',
]);

function capitalizeWord(word: string) {
  if (!word) {
    return word;
  }

  const lower = word.toLowerCase();

  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function resolveTitleWordCasing(word: string, index: number, words: string[], sourceHint?: string) {
  const lower = word.toLowerCase();
  const previous = index > 0 ? words[index - 1].toLowerCase() : '';

  if (sourceHint) {
    const sourceWord = sourceHint
      .trim()
      .split(/\s+/u)
      .find((candidate) => candidate.toLowerCase() === lower);

    if (sourceWord && /^[A-ZА-ЯЁІЇЄ]/.test(sourceWord)) {
      return sourceWord;
    }
  }

  if (index === 0) {
    return capitalizeWord(word);
  }

  if (TITLE_MINOR_WORDS.has(lower)) {
    return lower;
  }

  if (/^(?:звонок|call)$/iu.test(previous)) {
    return capitalizeWord(word);
  }

  if (/^[A-Z][\p{L}'-]+$/u.test(word)) {
    return word;
  }

  return lower;
}

export function normalizeCalendarEventTitle(title: string, sourceHint?: string) {
  const normalized = title.trim().replace(/\s+/g, ' ');

  if (!normalized || normalized.length < 2) {
    return normalized;
  }

  for (const entry of ACCUSATIVE_TO_NOMINATIVE) {
    if (entry.pattern.test(normalized)) {
      return normalized.replace(entry.pattern, entry.replace);
    }
  }

  const words = normalized.split(/\s+/u);

  return words.map((word, index) => resolveTitleWordCasing(word, index, words, sourceHint)).join(' ');
}
