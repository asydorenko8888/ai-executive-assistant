import { collapseCalendarEventCandidates } from '@/src/features/agent/calendar/calendarEventDeduplication';
import {
  normalizeTitleComparisonKey,
  titlesMatchCrossAlphabet,
} from '@/src/features/agent/calendar/calendarTitleTransliteration';

export type TitleMatchTier =
  | 'exact'
  | 'case_insensitive'
  | 'transliteration'
  | 'substring'
  | 'fuzzy'
  | 'none';

const TIER_RANK: Record<TitleMatchTier, number> = {
  exact: 400,
  case_insensitive: 300,
  transliteration: 280,
  substring: 200,
  fuzzy: 100,
  none: 0,
};

function normalizeTitleKey(value: string) {
  return normalizeTitleComparisonKey(value);
}

function tokenize(value: string) {
  return normalizeTitleKey(value)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 2);
}

function normalizeTitleToken(token: string) {
  let normalized = token;

  if (/^[A-Za-zА-Яа-яЁёІіЇїЄє'-]+у$/u.test(normalized) && normalized.length >= 4) {
    normalized = `${normalized.slice(0, -1)}а`;
  }

  return normalized;
}

function titleTokenStem(token: string) {
  const normalized = normalizeTitleToken(token);

  if (normalized.length >= 6) {
    return normalized.slice(0, 5);
  }

  if (normalized.length >= 4) {
    return normalized.slice(0, 4);
  }

  return normalized;
}

function levenshteinDistance(left: string, right: string) {
  const rows = left.length + 1;
  const cols = right.length + 1;
  const matrix = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

  for (let row = 0; row < rows; row += 1) {
    matrix[row][0] = row;
  }

  for (let col = 0; col < cols; col += 1) {
    matrix[0][col] = col;
  }

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const cost = left[row - 1] === right[col - 1] ? 0 : 1;
      matrix[row][col] = Math.min(
        matrix[row - 1][col] + 1,
        matrix[row][col - 1] + 1,
        matrix[row - 1][col - 1] + cost,
      );
    }
  }

  return matrix[rows - 1][cols - 1];
}

function tokensRoughlyMatch(queryToken: string, eventToken: string) {
  const query = normalizeTitleToken(queryToken);
  const event = normalizeTitleToken(eventToken);

  if (titlesMatchCrossAlphabet(queryToken, eventToken)) {
    return true;
  }

  if (query === event) {
    return true;
  }

  if (query.length >= 4 && event.length >= 4 && query === event) {
    return true;
  }

  if (query.includes(event) || event.includes(query)) {
    return true;
  }

  const queryStem = titleTokenStem(query);
  const eventStem = titleTokenStem(event);

  if (
    queryStem.length >= 4 &&
    eventStem.length >= 4 &&
    (queryStem.startsWith(eventStem) || eventStem.startsWith(queryStem))
  ) {
    return true;
  }

  if (query.length >= 5 && event.length >= 5) {
    return levenshteinDistance(query, event) <= 2;
  }

  return false;
}

export function classifyTitleMatchTier(titleQuery: string, eventTitle: string): TitleMatchTier {
  const queryNorm = normalizeTitleKey(titleQuery);
  const eventNorm = normalizeTitleKey(eventTitle);

  if (!queryNorm || !eventNorm) {
    return 'none';
  }

  if (eventNorm === queryNorm) {
    return 'exact';
  }

  if (eventNorm.includes(queryNorm) || queryNorm.includes(eventNorm)) {
    return 'substring';
  }

  if (titlesMatchCrossAlphabet(titleQuery, eventTitle)) {
    return 'transliteration';
  }

  const queryTokens = tokenize(queryNorm);
  const eventTokens = tokenize(eventNorm);

  if (queryTokens.length === 0) {
    return 'none';
  }

  const overlap = queryTokens.filter((token) =>
    eventTokens.some((eventToken) => tokensRoughlyMatch(token, eventToken)),
  ).length;

  return overlap > 0 ? 'fuzzy' : 'none';
}

export function scoreTitleMatchForMutation(titleQuery: string, eventTitle: string) {
  const tier = classifyTitleMatchTier(titleQuery, eventTitle);
  const overlap =
    tier === 'fuzzy'
      ? tokenize(titleQuery).filter((token) =>
          tokenize(eventTitle).some((eventToken) => tokensRoughlyMatch(token, eventToken)),
        ).length
      : 0;
  const fuzzyScore =
    tier === 'fuzzy' && tokenize(titleQuery).length > 0
      ? Math.round((overlap / tokenize(titleQuery).length) * 70)
      : 0;

  return {
    score: TIER_RANK[tier] + fuzzyScore,
    tier,
  };
}

export type TitlePrioritySelection<T extends { id: string; title: string }> = {
  match: T | null;
  candidates: T[];
  ambiguous: boolean;
  tier: TitleMatchTier;
};

export function selectBestEventByTitlePriority<T extends { id: string; title: string }>(
  events: T[],
  titleQuery: string,
): TitlePrioritySelection<T> {
  const query = titleQuery.trim();

  if (!query || events.length === 0) {
    return { match: null, candidates: [], ambiguous: false, tier: 'none' };
  }

  const ranked = events
    .map((event) => ({
      event,
      ...scoreTitleMatchForMutation(query, event.title),
    }))
    .filter((entry) => entry.tier !== 'none')
    .sort((left, right) => right.score - left.score);

  if (ranked.length === 0) {
    return { match: null, candidates: [], ambiguous: false, tier: 'none' };
  }

  const bestTier = ranked[0].tier;
  const tierPool = ranked.filter((entry) => entry.tier === bestTier);

  if (bestTier === 'fuzzy') {
    const hasStrongerTier = ranked.some((entry) => entry.tier !== 'fuzzy');

    if (hasStrongerTier) {
      return { match: null, candidates: [], ambiguous: false, tier: 'none' };
    }
  }

  if (tierPool.length > 1) {
    const topScore = tierPool[0].score;
    const close = tierPool.filter((entry) => topScore - entry.score <= 5);
    const collapsed = collapseCalendarEventCandidates(close.map((entry) => entry.event));

    if (collapsed.length === 1) {
      return {
        match: collapsed[0],
        candidates: [collapsed[0]],
        ambiguous: false,
        tier: bestTier,
      };
    }

    const distinctEvents = new Set(collapsed.map((event) => event.id));

    if (collapsed.length > 1 && distinctEvents.size > 1) {
      return {
        match: null,
        candidates: collapsed,
        ambiguous: true,
        tier: bestTier,
      };
    }
  }

  return {
    match: tierPool[0].event,
    candidates: [tierPool[0].event],
    ambiguous: false,
    tier: bestTier,
  };
}

/** @deprecated Use scoreTitleMatchForMutation — kept for diagnostics parity. */
export function scoreTitleMatch(titleQuery: string, eventTitle: string) {
  return scoreTitleMatchForMutation(titleQuery, eventTitle).score;
}
