/** Minimum user turns before pending intent / event memory expire. */
export const CONVERSATION_CONTEXT_MAX_TURNS = 10;

let turnsSinceContextTouch = 0;

export function advanceCalendarConversationTurn() {
  turnsSinceContextTouch += 1;
}

export function touchCalendarConversationContext() {
  turnsSinceContextTouch = 0;
}

export function isCalendarConversationContextFresh() {
  return turnsSinceContextTouch < CONVERSATION_CONTEXT_MAX_TURNS;
}

export function getConversationTurnsSinceTouch() {
  return turnsSinceContextTouch;
}
