import type { NowPlaying } from './nowPlaying';

export type JamStatus = {
  enabled: boolean;
  threshold: number;
  nowPlaying: { index: number; songId: string } | null;
  jamCount: number;
};

const DEFAULT_THRESHOLD = 2;

let jamEnabled = false;
let threshold = DEFAULT_THRESHOLD;

let currentSongKey: string | null = null;
let currentSongId: string | null = null;
let jammers = new Set<string>();
let announced = false;

function normalizeUser(name: string): string {
  return String(name || '').trim().toLowerCase();
}

function makeSongKey(now: NowPlaying): string {
  // Use file path for stability (songId can collide across folders)
  return now.filePath;
}

export function setJamEnabled(enabled: boolean): void {
  jamEnabled = enabled;
  if (!enabled) {
    // Keep state but stop counting while disabled
    // (we intentionally don't clear; re-enable continues for same song)
  }
}

export function isJamEnabled(): boolean {
  return jamEnabled;
}

export function setJamThreshold(next: number): void {
  const n = Math.max(1, Math.floor(Number(next) || DEFAULT_THRESHOLD));
  threshold = Number.isFinite(n) ? n : DEFAULT_THRESHOLD;
}

export function onNowPlayingUpdated(now: NowPlaying | null): void {
  if (!now) {
    currentSongKey = null;
    currentSongId = null;
    jammers = new Set();
    announced = false;
    return;
  }

  const nextKey = makeSongKey(now);
  if (currentSongKey !== nextKey) {
    currentSongKey = nextKey;
    currentSongId = now.songId;
    jammers = new Set();
    announced = false;
  }
}

export function tryJam(userName: string, now: NowPlaying | null): { jamCount: number; shouldAnnounce: boolean; songId: string | null } {
  if (!jamEnabled || !now) {
    return { jamCount: jammers.size, shouldAnnounce: false, songId: currentSongId };
  }

  // Ensure state is aligned with current song
  onNowPlayingUpdated(now);

  const userKey = normalizeUser(userName);
  if (!userKey) {
    return { jamCount: jammers.size, shouldAnnounce: false, songId: currentSongId };
  }

  jammers.add(userKey);

  const count = jammers.size;
  const reached = count >= threshold;
  const shouldAnnounce = reached && !announced;
  if (shouldAnnounce) {
    announced = true;
  }

  return { jamCount: count, shouldAnnounce, songId: currentSongId };
}

export function getJamStatus(now: NowPlaying | null): JamStatus {
  return {
    enabled: jamEnabled,
    threshold,
    nowPlaying: now ? { index: now.index, songId: now.songId } : null,
    jamCount: jammers.size
  };
}
