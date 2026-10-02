export const DEFAULT_PORT = Number(process.env.PORT) || 5050;
// Loopback only; URLs use the IP because "localhost" may resolve to ::1, where another app could hold the same port.
export const LOOPBACK_HOST = '127.0.0.1';
export const DEFAULT_POLL_INTERVAL = 500;
const MIN_POLL_INTERVAL = 100;

export function clampPollInterval(ms: number): number {
  const n = Math.max(MIN_POLL_INTERVAL, Math.floor(Number(ms) || 0));
  return Number.isFinite(n) ? n : DEFAULT_POLL_INTERVAL;
}
