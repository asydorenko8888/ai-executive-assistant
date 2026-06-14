import { ApiError } from '@/src/shared/api';

export const SPEECH_TRANSCRIPTION_UNAVAILABLE_MESSAGE =
  'Не вдалося розпізнати голос. Спробуйте ще раз.';

export const SPEECH_TRANSCRIBE_TIMEOUT_MS = 15_000;

const NETWORK_ERROR_PATTERN =
  /network request failed|failed to fetch|connection refused|err_connection|econnrefused|unable to resolve host|timeout/i;

function isBackendUnavailableError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.code === 'SPEECH_TRANSCRIBE_TIMEOUT') {
      return true;
    }

    if (error.status === 0 || error.status === 408 || error.status >= 502) {
      return true;
    }
  }

  if (error instanceof Error && NETWORK_ERROR_PATTERN.test(error.message)) {
    return true;
  }

  if (error instanceof TypeError) {
    return true;
  }

  return false;
}

export function resolveSpeechTranscriptionUserMessage(error: unknown) {
  if (isBackendUnavailableError(error)) {
    return SPEECH_TRANSCRIPTION_UNAVAILABLE_MESSAGE;
  }

  if (error instanceof ApiError) {
    return error.message || SPEECH_TRANSCRIPTION_UNAVAILABLE_MESSAGE;
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return SPEECH_TRANSCRIPTION_UNAVAILABLE_MESSAGE;
}
