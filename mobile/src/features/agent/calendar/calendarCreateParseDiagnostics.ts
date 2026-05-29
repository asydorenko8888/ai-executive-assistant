export function logCreateParse(payload: {
  originalText: string;
  cleanedText: string;
  extractedTitle: string | null;
  detectedDate: string | null;
  detectedTime: string | null;
}) {
  console.log('[CREATE PARSE]', {
    originalText: payload.originalText,
    cleanedText: payload.cleanedText,
    extractedTitle: payload.extractedTitle,
    detectedDate: payload.detectedDate,
    detectedTime: payload.detectedTime,
  });
}
