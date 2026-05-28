export function prepareTextForSpeech(text: string) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[*_#`]/g, '')
    .replace(/\n+/g, '. ')
    .replace(/\s+/g, ' ')
    .replace(/\.\s*\./g, '.')
    .trim();
}

export function splitTextForSpeech(text: string, maxSentences = 6) {
  const prepared = prepareTextForSpeech(text);

  if (!prepared) {
    return [];
  }

  const sentences = prepared
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);

  if (sentences.length === 0) {
    return [prepared];
  }

  return sentences.slice(0, maxSentences);
}
