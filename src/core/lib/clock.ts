/**
 * Injectable clock. The mock backend and the test panel can shift "now"
 * to test cut-offs, weekends and bank holidays. Production leaves the offset at 0.
 */
let offsetMs = 0;

export function setClockOffset(ms: number): void {
  offsetMs = ms;
}

export function getClockOffset(): number {
  return offsetMs;
}

export function now(): Date {
  return new Date(Date.now() + offsetMs);
}
