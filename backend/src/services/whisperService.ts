import { toFile } from 'openai';
import OpenAI from 'openai';

import { backendEnv } from '../config/env.js';

function createOpenAiClient() {
  const apiKey = backendEnv.OPENAI_API_KEY.trim();

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY_MISSING');
  }

  return new OpenAI({ apiKey });
}

function normalizeWhisperLanguage(language?: string) {
  if (!language) {
    return undefined;
  }

  const normalized = language.trim().toLowerCase();

  if (normalized.startsWith('uk')) {
    return 'uk';
  }

  if (normalized.startsWith('ru')) {
    return 'ru';
  }

  if (normalized.startsWith('en')) {
    return 'en';
  }

  return undefined;
}

export async function transcribeAudioBuffer(params: {
  buffer: Buffer;
  mimeType: string;
  originalName: string;
  language?: string;
}) {
  const openai = createOpenAiClient();
  const extension = params.originalName.includes('.') ? params.originalName.split('.').pop() : 'm4a';
  const file = await toFile(params.buffer, `recording.${extension ?? 'm4a'}`, {
    type: params.mimeType || 'audio/m4a',
  });

  const transcription = await openai.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    language: normalizeWhisperLanguage(params.language),
  });

  const text = transcription.text?.trim();

  if (!text) {
    throw new Error('WHISPER_EMPTY_TRANSCRIPT');
  }

  return text;
}
