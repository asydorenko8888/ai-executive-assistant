import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildPostActionAcknowledgmentReply,
  isPostActionAcknowledgmentPhrase,
  isPostActionAcknowledgmentTurn,
} from '@/src/features/agent/conversation/postActionAcknowledgmentReply';

describe('postActionAcknowledgmentReply', () => {
  it('detects bare acknowledgment phrases', () => {
    for (const phrase of [
      'ок',
      'добре',
      'дякую',
      'зрозуміло',
      'чудово',
      'перенесла',
      'ok',
      'thanks',
    ]) {
      assert.equal(isPostActionAcknowledgmentPhrase(phrase), true, phrase);
    }
  });

  it('does not treat action commands as acknowledgment', () => {
    assert.equal(isPostActionAcknowledgmentPhrase('Поставь будильник на 19:00'), false);
    assert.equal(isPostActionAcknowledgmentPhrase('Перенеси его на завтра'), false);
  });

  it('builds short localized replies', () => {
    assert.ok(['Добре.', 'Гаразд.', 'Звертайся.'].includes(buildPostActionAcknowledgmentReply('uk-UA', 'дякую')));
    assert.ok(['Хорошо.', 'Понял.', 'Обращайся.'].includes(buildPostActionAcknowledgmentReply('ru-RU', 'спасибо')));
    assert.ok(['Okay.', 'Got it.', 'Anytime.'].includes(buildPostActionAcknowledgmentReply('en-US', 'thanks')));
  });

  it('allows acknowledgment turn when no workflow is pending', () => {
    assert.equal(
      isPostActionAcknowledgmentTurn({ transcript: 'дякую' }),
      true,
    );
  });
});
