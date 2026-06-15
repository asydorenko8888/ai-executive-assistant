import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { classifyAssistantIntent } from '@/src/features/agent/intent/assistantIntentRouter';
import {
  buildUnrecognizedCommandFallbackReply,
  isLowConfidenceUnrecognizedTranscript,
  safeRouteHandler,
  UNRECOGNIZED_COMMAND_FALLBACK,
} from '@/src/features/agent/conversation/voiceTurnFallback';

describe('voice turn safety', () => {
  it('builds localized fallback replies', () => {
    assert.equal(buildUnrecognizedCommandFallbackReply('ru-RU'), UNRECOGNIZED_COMMAND_FALLBACK.ru);
    assert.equal(buildUnrecognizedCommandFallbackReply('uk-UA'), UNRECOGNIZED_COMMAND_FALLBACK.uk);
    assert.equal(buildUnrecognizedCommandFallbackReply('en-US'), UNRECOGNIZED_COMMAND_FALLBACK.en);
  });

  it('treats random meaningless transcript as unrecognized', () => {
    const transcript = 'блырпыщ жжж 12345';
    const intent = classifyAssistantIntent(transcript);

    assert.equal(isLowConfidenceUnrecognizedTranscript(transcript, intent), true);
  });

  it('treats empty transcript as unrecognized', () => {
    const intent = classifyAssistantIntent('');

    assert.equal(isLowConfidenceUnrecognizedTranscript('', intent), true);
    assert.equal(isLowConfidenceUnrecognizedTranscript('   ', intent), true);
  });

  it('treats partial noise transcript as unrecognized', () => {
    const intent = classifyAssistantIntent('ммм');

    assert.equal(isLowConfidenceUnrecognizedTranscript('ммм', intent), true);
  });

  it('does not treat conversational phrase as unrecognized', () => {
    const transcript = 'How are you today?';
    const intent = classifyAssistantIntent(transcript);

    assert.equal(isLowConfidenceUnrecognizedTranscript(transcript, intent), false);
  });

  it('safeRouteHandler returns null instead of throwing', async () => {
    const result = await safeRouteHandler({
      handler: 'test_throw',
      transcript: 'поставь будильник на кашу',
      run: async () => {
        throw new Error('malformed alarm phrase');
      },
    });

    assert.equal(result, null);
  });

  it('handles malformed weather phrase handler failure without throwing', async () => {
    const result = await safeRouteHandler({
      handler: 'weather',
      transcript: 'погода в',
      run: async () => {
        throw new Error('malformed weather phrase');
      },
    });

    assert.equal(result, null);
  });

  it('handles unsupported command handler failure without throwing', async () => {
    const result = await safeRouteHandler({
      handler: 'unsupported_command',
      transcript: 'сделай мне кофе роботом',
      run: async () => {
        throw new Error('unsupported');
      },
    });

    assert.equal(result, null);
  });
});
