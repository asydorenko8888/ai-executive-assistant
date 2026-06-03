export type AssistantRequestTerminalState =
  | 'completed'
  | 'failed'
  | 'interrupted'
  | 'timeout';

/** No tokens / no lifecycle bump for this long → graceful finalize. */
export const ASSISTANT_INACTIVITY_TIMEOUT_MS = 8_000;

/** Hard cap so a trickle stream cannot run forever. */
export const ASSISTANT_MAX_REQUEST_MS = 120_000;

/** Calendar mutations must not leave "Thinking with you..." hanging longer than this. */
export const CALENDAR_ASSISTANT_MAX_REQUEST_MS = 20_000;

export const ASSISTANT_TIMEOUT_FALLBACK =
  'I lost the thread for a second… try asking again.';

export function buildAssistantRecoveryMessage(
  partialContent: string | null | undefined,
  reason: 'timeout' | 'failed' | 'empty',
): string {
  const trimmed = partialContent?.trim();

  if (trimmed) {
    return `Looks like I got stuck while preparing the message. Here's the draft:\n'${trimmed}'`;
  }

  if (reason === 'timeout') {
    return ASSISTANT_TIMEOUT_FALLBACK;
  }

  return ASSISTANT_TIMEOUT_FALLBACK;
}

export function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as { name?: string; code?: string; message?: string };

  return (
    candidate.name === 'AbortError' ||
    candidate.code === 'ABORT_ERR' ||
    (typeof candidate.message === 'string' && /aborted|abort/i.test(candidate.message))
  );
}

export function logAssistantConversation(
  tag: '[Conversation]' | '[AssistantStream]' | '[AssistantFinalize]' | '[AssistantTimeout]' | '[AssistantPersist]',
  message: string,
  details?: Record<string, unknown>,
) {
  if (details) {
    console.log(tag, message, details);
    return;
  }

  console.log(tag, message);
}

type TimedAbortOptions = {
  inactivityMs?: number;
  maxMs?: number;
  onInactivity?: () => void;
  onMaxDuration?: () => void;
  externalSignal?: AbortSignal;
};

/**
 * Returns an AbortSignal that fires on external abort, inactivity, or max duration.
 * Call `touch()` whenever tokens or pipeline state advance.
 */
export function createAssistantRequestAbortController(options: TimedAbortOptions = {}) {
  const inactivityMs = options.inactivityMs ?? ASSISTANT_INACTIVITY_TIMEOUT_MS;
  const maxMs = options.maxMs ?? ASSISTANT_MAX_REQUEST_MS;
  const controller = new AbortController();
  let inactivityTimer: ReturnType<typeof setTimeout> | null = null;
  let maxTimer: ReturnType<typeof setTimeout> | null = null;
  let settled = false;

  const clearTimers = () => {
    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
      inactivityTimer = null;
    }

    if (maxTimer) {
      clearTimeout(maxTimer);
      maxTimer = null;
    }
  };

  const abort = (reason: 'external' | 'inactivity' | 'max_duration') => {
    if (settled || controller.signal.aborted) {
      return;
    }

    settled = true;
    clearTimers();

    if (reason === 'inactivity') {
      logAssistantConversation('[AssistantTimeout]', 'Inactivity timeout fired', {
        inactivityMs,
      });
      options.onInactivity?.();
    } else if (reason === 'max_duration') {
      logAssistantConversation('[AssistantTimeout]', 'Max request duration reached', { maxMs });
      options.onMaxDuration?.();
    }

    controller.abort();
  };

  const scheduleInactivity = () => {
    if (settled || controller.signal.aborted) {
      return;
    }

    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
    }

    inactivityTimer = setTimeout(() => abort('inactivity'), inactivityMs);
  };

  const touch = () => {
    scheduleInactivity();
  };

  const dispose = () => {
    settled = true;
    clearTimers();
  };

  scheduleInactivity();

  if (!maxTimer) {
    maxTimer = setTimeout(() => abort('max_duration'), maxMs);
  }

  if (options.externalSignal) {
    if (options.externalSignal.aborted) {
      abort('external');
    } else {
      options.externalSignal.addEventListener(
        'abort',
        () => abort('external'),
        { once: true },
      );
    }
  }

  return {
    signal: controller.signal,
    touch,
    dispose,
    abort: () => abort('external'),
  };
}

export async function fetchWithAbort(
  input: RequestInfo | URL,
  init: RequestInit & { signal?: AbortSignal },
): Promise<Response> {
  const response = await fetch(input, init);

  if (init.signal?.aborted) {
    throw Object.assign(new Error('The assistant request was aborted.'), { name: 'AbortError' });
  }

  return response;
}
