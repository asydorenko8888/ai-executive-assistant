/**
 * TEMPORARY emergency debugging switch.
 * Set to false to restore smart auto-scroll behavior.
 */
export const FORCE_DISABLE_AUTOSCROLL = false;

export function isChatAutoScrollAllowed() {
  return !FORCE_DISABLE_AUTOSCROLL;
}
