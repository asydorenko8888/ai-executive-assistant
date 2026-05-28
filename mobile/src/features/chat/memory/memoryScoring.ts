import type { LongTermMemory, MemoryCandidate, MemoryCategory } from '@/src/features/chat/memory/types';

const MEMORY_MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

const categoryBaseWeights: Record<MemoryCategory, number> = {
  preference: 0.7,
  life_event: 0.84,
  relationship: 0.8,
  recurring_goal: 0.76,
  habit: 0.68,
  fear: 0.7,
  project: 0.82,
  routine: 0.66,
  communication_style: 0.74,
  situation: 0.8,
};

const semanticConceptAliases: Record<string, string[]> = {
  late_night_work: [
    'late night',
    'late-night',
    'night owl',
    'work at night',
    'work late',
    'пізно вночі',
    'вночі працюю',
    'нічна робота',
    'ночью работ',
    'работаю ночью',
    'ночами работ',
  ],
  burnout: [
    'burnout',
    'burned out',
    'burnt out',
    'exhausted',
    'overloaded',
    'running on empty',
    'виснажен',
    'вигор',
    'вигоран',
    'перевтом',
    'перегруз',
    'выгор',
    'измотан',
  ],
  immigration: [
    'immigration',
    'visa',
    'residency',
    'relocation',
    'move countries',
    'moving countries',
    'імміграц',
    'віза',
    'внж',
    'релокац',
    'переїзд',
    'переезд',
    'иммиграц',
  ],
  relationships: [
    'wife',
    'husband',
    'partner',
    'girlfriend',
    'boyfriend',
    'family',
    'дружина',
    'чоловік',
    'партнер',
    'жена',
    'муж',
    'семья',
    'родина',
  ],
  direct_communication: [
    'be direct',
    'be brief',
    'concise',
    'short answers',
    'без води',
    'коротко',
    'прямо',
    'по делу',
    'без лишнего',
  ],
  project_building: [
    'project',
    'startup',
    'launch',
    'product',
    'company',
    'build',
    'ship',
    'проєкт',
    'стартап',
    'запуск',
    'продукт',
    'компан',
    'проект',
    'продукт',
    'запускаю',
  ],
  anxiety: [
    'afraid',
    'scared',
    'worried',
    'anxious',
    'uncertain',
    'боюся',
    'страшно',
    'тривог',
    'нервую',
    'переживаю',
    'боюсь',
    'тревог',
  ],
  work_rhythm: [
    'routine',
    'usually',
    'most days',
    'every day',
    'schedule',
    'ритм',
    'рутина',
    'звично',
    'зазвичай',
    'обычно',
    'режим',
  ],
};

const stopWords = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'but',
  'for',
  'from',
  'have',
  'how',
  'i',
  'if',
  'in',
  'into',
  'is',
  'it',
  'its',
  'me',
  'my',
  'of',
  'on',
  'or',
  'that',
  'the',
  'this',
  'to',
  'we',
  'with',
  'you',
  'ya',
  'я',
  'мене',
  'меня',
  'це',
  'это',
  'що',
  'что',
  'як',
  'как',
  'та',
  'и',
  'й',
  'у',
  'в',
  'на',
  'не',
  'але',
  'но',
  'для',
  'про',
  'об',
  'за',
]);

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeMemoryText(text: string) {
  return text
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9а-яіїєґё\s-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenizeMemoryText(text: string) {
  return normalizeMemoryText(text)
    .split(' ')
    .filter((token) => token.length >= 3 && !stopWords.has(token));
}

export function extractSemanticConcepts(text: string) {
  const normalizedText = normalizeMemoryText(text);

  return Object.entries(semanticConceptAliases)
    .filter(([, aliases]) => aliases.some((alias) => normalizedText.includes(normalizeMemoryText(alias))))
    .map(([concept]) => concept);
}

function jaccardSimilarity(left: string[], right: string[]) {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  const leftSet = new Set(left);
  const rightSet = new Set(right);
  let intersectionCount = 0;

  leftSet.forEach((value) => {
    if (rightSet.has(value)) {
      intersectionCount += 1;
    }
  });

  const unionCount = new Set([...leftSet, ...rightSet]).size;

  return unionCount === 0 ? 0 : intersectionCount / unionCount;
}

function scoreExistingMemorySimilarity(candidate: MemoryCandidate, existingMemory: LongTermMemory) {
  const keywordSimilarity = jaccardSimilarity(candidate.keywords, existingMemory.keywords);
  const tagSimilarity = jaccardSimilarity(candidate.tags, existingMemory.tags);
  const summarySimilarity = jaccardSimilarity(
    tokenizeMemoryText(candidate.summary),
    tokenizeMemoryText(existingMemory.summary),
  );

  const categoryMatch = candidate.category === existingMemory.category ? 0.18 : 0;

  return categoryMatch + keywordSimilarity * 0.36 + tagSimilarity * 0.28 + summarySimilarity * 0.32;
}

export function calculateRecencyWeight(timestamp: string, now = new Date()) {
  const parsedTimestamp = Date.parse(timestamp);

  if (Number.isNaN(parsedTimestamp)) {
    return 0.35;
  }

  const ageInDays = Math.max(0, (now.getTime() - parsedTimestamp) / MEMORY_MILLISECONDS_PER_DAY);
  return clamp(Math.exp(-ageInDays / 21), 0.18, 1);
}

export function scoreMemoryCandidate(candidate: MemoryCandidate, existingMemories: LongTermMemory[]) {
  const baseWeight = categoryBaseWeights[candidate.category] ?? 0.66;
  const strongestExistingMatch = existingMemories.reduce((currentMax, memory) => {
    return Math.max(currentMax, scoreExistingMemorySimilarity(candidate, memory));
  }, 0);

  const score =
    baseWeight +
    candidate.directness * 0.14 +
    candidate.salience * 0.14 +
    candidate.emotionalWeight * 0.08 +
    strongestExistingMatch * 0.08;

  return clamp(score);
}

export function shouldStoreCandidate(score: number) {
  return score >= 0.68;
}

export function scoreMemoryRelevance({
  memory,
  query,
  currentTopics,
  activeSituations,
  now = new Date(),
}: {
  memory: LongTermMemory;
  query: string;
  currentTopics: string[];
  activeSituations: string[];
  now?: Date;
}) {
  const queryTokens = tokenizeMemoryText(query);
  const memoryTokens = Array.from(new Set([...memory.keywords, ...tokenizeMemoryText(memory.summary)]));
  const queryConcepts = extractSemanticConcepts(`${query} ${currentTopics.join(' ')} ${activeSituations.join(' ')}`);
  const memoryConcepts = Array.from(new Set([...memory.tags, ...extractSemanticConcepts(memory.details)]));

  const lexicalOverlap = jaccardSimilarity(queryTokens, memoryTokens);
  const conceptualOverlap = jaccardSimilarity(queryConcepts, memoryConcepts);
  const topicOverlap = jaccardSimilarity(currentTopics, memory.tags);
  const situationOverlap = jaccardSimilarity(activeSituations, memory.tags);
  const recencyWeight = calculateRecencyWeight(memory.lastUpdatedAt, now);
  const retrievalFreshnessPenalty = memory.lastRetrievedAt
    ? 1 - calculateRecencyWeight(memory.lastRetrievedAt, now) * 0.16
    : 1;

  const relevance =
    lexicalOverlap * 0.35 +
    conceptualOverlap * 0.26 +
    topicOverlap * 0.12 +
    situationOverlap * 0.12 +
    recencyWeight * 0.1 +
    memory.importance * 0.05;

  return clamp(relevance * retrievalFreshnessPenalty);
}
