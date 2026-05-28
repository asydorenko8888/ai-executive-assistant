import type { ChatMessage } from '@/src/entities/chat/types';
import type { LongTermMemory, MemoryCandidate, MemoryCategory } from '@/src/features/chat/memory/types';
import {
  extractSemanticConcepts,
  normalizeMemoryText,
  scoreMemoryCandidate,
  shouldStoreCandidate,
  tokenizeMemoryText,
} from '@/src/features/chat/memory/memoryScoring';

type ExtractionRule = {
  category: MemoryCategory;
  pattern: RegExp;
  build: (match: RegExpMatchArray, message: ChatMessage) => Omit<MemoryCandidate, 'capturedAt' | 'sourceMessageId' | 'sourceSnippet'> | null;
};

const extractionRules: ExtractionRule[] = [
  {
    category: 'preference',
    pattern:
      /\b(?:i like|i love|i prefer|i hate|мені подобається|я люблю|я предпочитаю|мне нравится|я люблю|терпіти не можу)\b\s+([^.!?\n]+)/i,
    build: (match) => {
      const preference = match[1]?.trim();

      if (!preference || preference.length < 6) {
        return null;
      }

      return {
        category: 'preference',
        summary: `Prefers ${preference}`,
        details: preference,
        tags: [...extractSemanticConcepts(preference), 'preference'],
        keywords: tokenizeMemoryText(preference),
        directness: 0.92,
        emotionalWeight: 0.32,
        salience: 0.66,
      };
    },
  },
  {
    category: 'communication_style',
    pattern:
      /\b(?:be|stay|answer|говори|відповідай|пиши)\b\s+([^.!?\n]*(?:direct|brief|concise|коротко|прямо|без води|по делу|без лишнего)[^.!?\n]*)/i,
    build: (match) => {
      const stylePreference = match[1]?.trim();

      if (!stylePreference) {
        return null;
      }

      return {
        category: 'communication_style',
        summary: 'Prefers direct communication',
        details: stylePreference,
        tags: ['communication_style', ...extractSemanticConcepts(stylePreference)],
        keywords: ['direct', ...tokenizeMemoryText(stylePreference)],
        directness: 0.96,
        emotionalWeight: 0.18,
        salience: 0.78,
      };
    },
  },
  {
    category: 'project',
    pattern:
      /\b(?:i am working on|i'm working on|i'm building|i am building|i'm launching|i am launching|працюю над|будую|запускаю|работаю над|строю|запускаю)\b\s+([^.!?\n]+)/i,
    build: (match) => {
      const project = match[1]?.trim();

      if (!project || project.length < 6) {
        return null;
      }

      return {
        category: 'project',
        summary: `Current project: ${project}`,
        details: project,
        tags: ['project', ...extractSemanticConcepts(project)],
        keywords: tokenizeMemoryText(project),
        directness: 0.88,
        emotionalWeight: 0.2,
        salience: 0.9,
      };
    },
  },
  {
    category: 'recurring_goal',
    pattern:
      /\b(?:i want to|i'm trying to|i am trying to|хочу|намагаюся|пытаюсь|хочу)\b\s+([^.!?\n]+)/i,
    build: (match) => {
      const goal = match[1]?.trim();

      if (!goal || goal.length < 6) {
        return null;
      }

      return {
        category: 'recurring_goal',
        summary: `Wants to ${goal}`,
        details: goal,
        tags: ['goal', ...extractSemanticConcepts(goal)],
        keywords: tokenizeMemoryText(goal),
        directness: 0.86,
        emotionalWeight: 0.26,
        salience: 0.78,
      };
    },
  },
  {
    category: 'fear',
    pattern:
      /\b(?:i am afraid|i'm afraid|i fear|i worry about|боюся|мене лякає|меня пугает|я боюсь|переживаю через|переживаю из-за)\b\s+([^.!?\n]+)/i,
    build: (match) => {
      const fear = match[1]?.trim();

      if (!fear || fear.length < 5) {
        return null;
      }

      return {
        category: 'fear',
        summary: `Worry keeps returning around ${fear}`,
        details: fear,
        tags: ['fear', ...extractSemanticConcepts(fear)],
        keywords: tokenizeMemoryText(fear),
        directness: 0.82,
        emotionalWeight: 0.82,
        salience: 0.74,
      };
    },
  },
  {
    category: 'routine',
    pattern:
      /\b(?:i usually|i often|i tend to|i work best|зазвичай|часто|схильний|краще працюю|обычно|часто|лучше работаю)\b\s+([^.!?\n]+)/i,
    build: (match) => {
      const routine = match[1]?.trim();

      if (!routine || routine.length < 5) {
        return null;
      }

      return {
        category: 'routine',
        summary: `Typical routine: ${routine}`,
        details: routine,
        tags: ['routine', ...extractSemanticConcepts(routine)],
        keywords: tokenizeMemoryText(routine),
        directness: 0.76,
        emotionalWeight: 0.18,
        salience: 0.66,
      };
    },
  },
  {
    category: 'habit',
    pattern:
      /\b(?:i keep|i always|i end up|я постійно|я завжди|я вечно|я постоянно)\b\s+([^.!?\n]+)/i,
    build: (match) => {
      const habit = match[1]?.trim();

      if (!habit || habit.length < 5) {
        return null;
      }

      return {
        category: 'habit',
        summary: `Recurring pattern: ${habit}`,
        details: habit,
        tags: ['habit', ...extractSemanticConcepts(habit)],
        keywords: tokenizeMemoryText(habit),
        directness: 0.74,
        emotionalWeight: 0.28,
        salience: 0.62,
      };
    },
  },
];

const relationshipMarkers = [
  'my wife',
  'my husband',
  'my partner',
  'my daughter',
  'my son',
  'my mother',
  'my father',
  'my family',
  'my cofounder',
  'my manager',
  'моя дружина',
  'мій чоловік',
  'моя партнерка',
  'моя сімʼя',
  'моя родина',
  'мой муж',
  'моя жена',
  'мой партнер',
  'моя семья',
  'мой кофаундер',
];

const situationMarkers: { marker: string; summary: string }[] = [
  { marker: 'immigration', summary: 'Immigration remains an active life situation' },
  { marker: 'імміграц', summary: 'Immigration remains an active life situation' },
  { marker: 'иммиграц', summary: 'Immigration remains an active life situation' },
  { marker: 'visa', summary: 'Visa and residency questions are active in the background' },
  { marker: 'віза', summary: 'Visa and residency questions are active in the background' },
  { marker: 'виза', summary: 'Visa and residency questions are active in the background' },
  { marker: 'burnout', summary: 'Burnout risk has come up as a recurring situation' },
  { marker: 'вигоран', summary: 'Burnout risk has come up as a recurring situation' },
  { marker: 'выгор', summary: 'Burnout risk has come up as a recurring situation' },
  { marker: 'relocation', summary: 'Relocation remains an active situation' },
  { marker: 'релокац', summary: 'Relocation remains an active situation' },
  { marker: 'переїзд', summary: 'Relocation remains an active situation' },
  { marker: 'переезд', summary: 'Relocation remains an active situation' },
];

function buildRelationshipCandidate(message: ChatMessage) {
  const normalizedContent = normalizeMemoryText(message.content);
  const matchedMarker = relationshipMarkers.find((marker) =>
    normalizedContent.includes(normalizeMemoryText(marker)),
  );

  if (!matchedMarker) {
    return null;
  }

  return {
    category: 'relationship' as const,
    summary: `Important relationship context: ${matchedMarker}`,
    details: message.content.trim(),
    tags: ['relationship', ...extractSemanticConcepts(message.content)],
    keywords: tokenizeMemoryText(message.content),
    directness: 0.72,
    emotionalWeight: 0.34,
    salience: 0.72,
    sourceMessageId: message.id,
    sourceSnippet: message.content.trim(),
    capturedAt: new Date().toISOString(),
  };
}

function buildSituationCandidate(message: ChatMessage) {
  const normalizedContent = normalizeMemoryText(message.content);
  const matchedSituation = situationMarkers.find((entry) =>
    normalizedContent.includes(normalizeMemoryText(entry.marker)),
  );

  if (!matchedSituation) {
    return null;
  }

  return {
    category: 'situation' as const,
    summary: matchedSituation.summary,
    details: message.content.trim(),
    tags: ['situation', ...extractSemanticConcepts(message.content)],
    keywords: tokenizeMemoryText(message.content),
    directness: 0.82,
    emotionalWeight: normalizedContent.includes('burnout') || normalizedContent.includes('виго') ? 0.7 : 0.44,
    salience: 0.86,
    sourceMessageId: message.id,
    sourceSnippet: message.content.trim(),
    capturedAt: new Date().toISOString(),
  };
}

function createCandidate(
  message: ChatMessage,
  baseCandidate: Omit<MemoryCandidate, 'capturedAt' | 'sourceMessageId' | 'sourceSnippet'>,
): MemoryCandidate {
  return {
    ...baseCandidate,
    capturedAt: new Date().toISOString(),
    sourceMessageId: message.id,
    sourceSnippet: message.content.trim(),
  };
}

function dedupeCandidates(candidates: MemoryCandidate[]) {
  const uniqueCandidates = new Map<string, MemoryCandidate>();

  candidates.forEach((candidate) => {
    const dedupeKey = `${candidate.category}:${normalizeMemoryText(candidate.summary)}`;
    const existingCandidate = uniqueCandidates.get(dedupeKey);

    if (!existingCandidate || candidate.salience + candidate.directness > existingCandidate.salience + existingCandidate.directness) {
      uniqueCandidates.set(dedupeKey, candidate);
    }
  });

  return Array.from(uniqueCandidates.values());
}

export function extractMeaningfulMemories(
  messages: ChatMessage[],
  existingMemories: LongTermMemory[],
) {
  const candidates: MemoryCandidate[] = [];

  messages
    .filter((message) => message.role === 'user' && message.content.trim().length >= 12)
    .slice(-18)
    .forEach((message) => {
      extractionRules.forEach((rule) => {
        const match = message.content.match(rule.pattern);

        if (!match) {
          return;
        }

        const candidate = rule.build(match, message);

        if (candidate) {
          candidates.push(createCandidate(message, candidate));
        }
      });

      const relationshipCandidate = buildRelationshipCandidate(message);

      if (relationshipCandidate) {
        candidates.push(relationshipCandidate);
      }

      const situationCandidate = buildSituationCandidate(message);

      if (situationCandidate) {
        candidates.push(situationCandidate);
      }
    });

  return dedupeCandidates(candidates).filter((candidate) => {
    const score = scoreMemoryCandidate(candidate, existingMemories);
    return shouldStoreCandidate(score);
  });
}
