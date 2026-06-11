/**
 * Cyrillic ↔ Latin title matching for calendar event lookup.
 * Used when the user speaks a name in one script and Google Calendar stores it in another.
 */

const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  ґ: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  є: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  і: 'i',
  ї: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

export function normalizeTitleComparisonKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\d]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function containsCyrillicLetters(value: string) {
  return /\p{Script=Cyrillic}/u.test(value);
}

export function containsLatinLetters(value: string) {
  return /[A-Za-z]/.test(value);
}

export function transliterateCyrillicToLatin(value: string) {
  let result = '';

  for (const char of value.toLowerCase()) {
    result += CYRILLIC_TO_LATIN[char] ?? char;
  }

  return result.replace(/\s+/g, ' ').trim();
}

export function buildCrossAlphabetTitleForms(title: string) {
  const normalized = normalizeTitleComparisonKey(title);

  if (!normalized) {
    return [];
  }

  const forms = new Set<string>([normalized]);

  if (containsCyrillicLetters(normalized)) {
    forms.add(transliterateCyrillicToLatin(normalized));
  }

  return [...forms].filter(Boolean);
}

function formsOverlap(leftForms: string[], rightForms: string[]) {
  for (const left of leftForms) {
    for (const right of rightForms) {
      if (left === right) {
        return true;
      }

      if (left.length >= 2 && right.length >= 2 && (left.includes(right) || right.includes(left))) {
        return true;
      }
    }
  }

  return false;
}

/**
 * True when titles likely refer to the same event across Cyrillic/Latin spelling.
 */
export function titlesMatchCrossAlphabet(titleQuery: string, eventTitle: string) {
  const queryForms = buildCrossAlphabetTitleForms(titleQuery);
  const eventForms = buildCrossAlphabetTitleForms(eventTitle);

  if (queryForms.length === 0 || eventForms.length === 0) {
    return false;
  }

  const queryUsesCyrillic = containsCyrillicLetters(titleQuery);
  const eventUsesCyrillic = containsCyrillicLetters(eventTitle);
  const queryUsesLatin = containsLatinLetters(titleQuery);
  const eventUsesLatin = containsLatinLetters(eventTitle);
  const crossesAlphabets =
    (queryUsesCyrillic && eventUsesLatin) || (queryUsesLatin && eventUsesCyrillic);

  if (!crossesAlphabets) {
    return false;
  }

  return formsOverlap(queryForms, eventForms);
}
