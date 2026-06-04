import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isChatNearBottom } from '@/src/features/chat/debug/chatScrollLogic';

describe('chat scroll near-bottom detection', () => {
  it('returns true when within 150px of bottom', () => {
    assert.equal(
      isChatNearBottom({
        scrollHeight: 1000,
        scrollTop: 700,
        clientHeight: 200,
      }),
      true,
    );
  });

  it('returns false when scrolled up beyond threshold', () => {
    assert.equal(
      isChatNearBottom({
        scrollHeight: 1000,
        scrollTop: 500,
        clientHeight: 200,
      }),
      false,
    );
  });
});
