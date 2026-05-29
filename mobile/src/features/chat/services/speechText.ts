import {
  isNumberedAgendaListText,
  shouldPreserveFullCalendarAgenda,
} from '@/src/features/voice/speech/voiceSpeechFormatter';

export function prepareTextForSpeech(text: string) {
  if (shouldPreserveFullCalendarAgenda(text) || isNumberedAgendaListText(text)) {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/[*_#`]/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  return text
    .replace(/\r\n/g, '\n')
    .replace(/[*_#`]/g, '')
    .replace(/\n+/g, '. ')
    .replace(/\s+/g, ' ')
    .replace(/\.\s*\./g, '.')
    .trim();
}

export function splitTextForSpeech(text: string, maxSentences = 6) {
  const preserveAgenda =
    shouldPreserveFullCalendarAgenda(text) || isNumberedAgendaListText(text);
  const prepared = prepareTextForSpeech(text);

  if (!prepared) {
    return [];
  }

  if (preserveAgenda) {
    return [prepared];
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
