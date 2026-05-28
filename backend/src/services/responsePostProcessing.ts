const markdownHeadingPattern = /^\s{0,3}(?:#{1,6}\s+.+|\*\*[^*]+\*\*:?)\s*$/gim;

const genericLeadingSentencePatterns = [
  /^(?:це\s+зрозуміло|це\s+дуже\s+зрозуміло)[.!?\s]+/iu,
  /^(?:я\s+розумію|я\s+чу[ю]?|я\s+бачу)[^.!?]{0,120}[.!?]\s+/iu,
  /^(?:багато\s+людей\s+відчувають|багато\s+хто\s+відчуває)[^.!?]{0,160}[.!?]\s+/iu,
  /^(?:многие\s+люди\s+чувствуют|это\s+понятно|это\s+вполне\s+понятно)[^.!?]{0,160}[.!?]\s+/iu,
  /^(?:i\s+understand|that(?:'s| is)\s+understandable|many\s+people\s+feel)[^.!?]{0,160}[.!?]\s+/iu,
  /^(?:важливо\s+(?:пам['’]ятати|розуміти|знати)|варто\s+(?:пам['’]ятати|розуміти|знати)|потрібно\s+(?:пам['’]ятати|розуміти|знати))[^.!?]{0,160}[.!?]\s+/iu,
  /^(?:важно\s+(?:помнить|понимать|знать)|стоит\s+(?:помнить|понимать|знать)|нужно\s+(?:помнить|понимать|знать))[^.!?]{0,160}[.!?]\s+/iu,
  /^(?:it(?:'s| is)\s+important\s+to\s+(?:remember|understand|note)|you\s+should\s+remember)[^.!?]{0,160}[.!?]\s+/iu,
];

const corporateFluffPatterns = [
  /\bkeep your focus sharp\b/gi,
  /\bpace looks manageable\b/gi,
  /\bnavigate thoughtfully\b/gi,
  /\bintentional moves?\b/gi,
  /\broom to breathe\b/gi,
  /\bstay deliberate\b/gi,
  /\bthe day still has some room to work with\b/gi,
  /\bthe day has a steady rhythm\b/gi,
  /\bthe schedule already feels fairly full\b/gi,
];

const genericTrailingQuestionPatterns = [
  /\s+(?:як\s+ти\s+це\s+відчуваєш\??|що\s+ти\s+відчуваєш\??)\s*$/iu,
  /\s+(?:как\s+ты\s+это\s+чувствуешь\??|что\s+ты\s+чувствуешь\??)\s*$/iu,
  /\s+(?:how\s+does\s+that\s+feel\??|how\s+are\s+you\s+feeling\s+about\s+that\??)\s*$/iu,
  /\s+(?:хочеш,\s*я\s+допоможу[^?]*\??|хочеш,\s*можу[^?]*\??)\s*$/iu,
  /\s+(?:хотите,\s*я\s+помогу[^?]*\??|хочешь,\s*я\s+помогу[^?]*\??)\s*$/iu,
  /\s+(?:would\s+you\s+like\s+me\s+to\s+help[^?]*\??|want\s+me\s+to\s+help[^?]*\??)\s*$/iu,
];

function normalizeWhitespace(text: string) {
  return text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function stripMarkdownScaffolding(text: string) {
  return text.replace(markdownHeadingPattern, '').replace(/\n{3,}/g, '\n\n').trim();
}

function stripGenericLeadingSentence(text: string) {
  let nextText = text;

  for (const pattern of genericLeadingSentencePatterns) {
    if (pattern.test(nextText)) {
      const strippedText = nextText.replace(pattern, '').trim();

      if (strippedText.length >= 28) {
        nextText = strippedText;
      }
    }
  }

  return nextText;
}

function stripCorporateFluff(text: string) {
  let nextText = text;

  for (const pattern of corporateFluffPatterns) {
    nextText = nextText.replace(pattern, '').replace(/\s{2,}/g, ' ');
  }

  return nextText.replace(/\s+([,.!?])/g, '$1').trim();
}

function stripGenericTrailingQuestion(text: string) {
  let nextText = text;

  for (const pattern of genericTrailingQuestionPatterns) {
    if (pattern.test(nextText)) {
      const strippedText = nextText.replace(pattern, '').trim();

      if (strippedText.length >= 28) {
        nextText = strippedText;
      }
    }
  }

  return nextText;
}

export function normalizeAssistantReply(text: string) {
  const normalizedText = normalizeWhitespace(text);

  if (!normalizedText) {
    return normalizedText;
  }

  return normalizeWhitespace(
    stripGenericTrailingQuestion(
      stripGenericLeadingSentence(stripCorporateFluff(stripMarkdownScaffolding(normalizedText))),
    ),
  );
}
