export function logDateParser(payload: {
  original: string;
  resolvedDate: string | null;
  resolvedTime: string | null;
}) {
  console.log('[DATE PARSER]');
  console.log(`original=${payload.original}`);
  console.log(`resolvedDate=${payload.resolvedDate ?? ''}`);
  console.log(`resolvedTime=${payload.resolvedTime ?? ''}`);
}
