import { Platform } from 'react-native';

import {
  logTranscribeError,
  logTranscribeStart,
  logTranscribeSuccess,
} from '@/src/features/voice/speechPipelineLog';
import { SPEECH_TRANSCRIBE_TIMEOUT_MS } from '@/src/features/voice/speechTranscriptionUserMessage';
import { ApiError, createApiErrorFromResponse, toApiError } from '@/src/shared/api';
import { getAppApiKeyHeaders } from '@/src/shared/api/authHeaders';
import { env } from '@/src/shared/config';

function getRuntimeApiBaseUrl() {
  const configuredBaseUrl = env.apiBaseUrl;

  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return configuredBaseUrl;
  }

  try {
    const currentHostname = window.location.hostname;
    const url = new URL(configuredBaseUrl);

    if (
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1') &&
      currentHostname
    ) {
      url.hostname = currentHostname;
    }

    return url.toString().replace(/\/$/, '');
  } catch {
    return configuredBaseUrl;
  }
}

type TranscribeAudioResponse = {
  transcript?: string;
};

export async function transcribeAudioFile(params: {
  uri: string;
  language?: string;
  mimeType?: string;
}) {
  const requestUrl = `${getRuntimeApiBaseUrl()}/speech/transcribe`;
  const formData = new FormData();
  const fileName = params.uri.split('/').pop() ?? 'recording.m4a';
  const mimeType = params.mimeType ?? 'audio/m4a';

  formData.append('audio', {
    uri: params.uri,
    name: fileName,
    type: mimeType,
  } as unknown as Blob);

  if (params.language) {
    formData.append('language', params.language);
  }

  logTranscribeStart({ language: params.language });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SPEECH_TRANSCRIBE_TIMEOUT_MS);

  try {
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: getAppApiKeyHeaders(),
      body: formData,
      signal: controller.signal,
    });

    const contentType = response.headers.get('content-type') ?? '';
    const payload = contentType.includes('application/json')
      ? ((await response.json()) as TranscribeAudioResponse & { message?: string })
      : await response.text();

    if (!response.ok) {
      throw createApiErrorFromResponse(response.status, payload);
    }

    const transcript =
      typeof payload === 'object' && payload && 'transcript' in payload
        ? payload.transcript?.trim()
        : '';

    if (!transcript) {
      const emptyError = new ApiError({
        message: 'Speech transcription returned an empty result.',
        status: 502,
        code: 'SPEECH_EMPTY_TRANSCRIPT',
        retryable: true,
      });
      logTranscribeError({ message: emptyError.message, code: emptyError.code });
      throw emptyError;
    }

    logTranscribeSuccess({
      transcriptPreview: transcript.slice(0, 120),
    });

    return transcript;
  } catch (error) {
    if (error instanceof ApiError) {
      logTranscribeError({ message: error.message, code: error.code });
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      const timeoutError = new ApiError({
        message: 'Speech transcription timed out.',
        status: 408,
        code: 'SPEECH_TRANSCRIBE_TIMEOUT',
        retryable: true,
      });
      logTranscribeError({ message: timeoutError.message, code: timeoutError.code });
      throw timeoutError;
    }

    const apiError = toApiError(error);
    logTranscribeError({ message: apiError.message, code: apiError.code });
    throw apiError;
  } finally {
    clearTimeout(timeoutId);
  }
}
