export function logCalendarReadReplyBuilt(params: {
  intent: string;
  title?: string | null;
  start?: string | null;
  durationText?: string | null;
  transcriptPreview: string;
}) {
  console.error('CALENDAR_READ_REPLY_BUILT', {
    intent: params.intent,
    title: params.title ?? null,
    start: params.start ?? null,
    durationText: params.durationText ?? null,
    transcriptPreview: params.transcriptPreview.slice(0, 160),
  });
}
