export const CHAT_NEAR_BOTTOM_THRESHOLD_PX = 150;

export function isChatNearBottom(params: {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
  thresholdPx?: number;
}) {
  const threshold = params.thresholdPx ?? CHAT_NEAR_BOTTOM_THRESHOLD_PX;
  return params.scrollHeight - params.scrollTop - params.clientHeight < threshold;
}
