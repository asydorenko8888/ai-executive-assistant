/**
 * Dev-only diagnostic logging. Uses console.log so markers never surface as LogBox error overlays.
 */
export function devConsoleLog(marker: string, details?: Record<string, unknown> | unknown) {
  if (typeof __DEV__ !== 'undefined' && !__DEV__) {
    return;
  }

  if (details === undefined) {
    console.log(marker);
    return;
  }

  console.log(marker, details);
}
