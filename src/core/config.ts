export const DEFAULT_PORT = Number(process.env.PORT) || 3000;
export const DEFAULT_POLL_INTERVAL = 1000;
export const MIN_POLL_INTERVAL = 100;

export function clampPollInterval(ms: number): number {
  const n = Math.max(MIN_POLL_INTERVAL, Math.floor(Number(ms) || 0));
  return Number.isFinite(n) ? n : DEFAULT_POLL_INTERVAL;
}
