import type { NowPlaying } from './nowPlaying';
import { getJamCountMinimum } from './settings';

export type JamStatus = {
  enabled: boolean;
  threshold: number;
  nowPlaying: { index: number; songId: string } | null;
  jamCount: number;
};

export type JamFinale = {
  songId: string;
  jamCount: number;
};

const DEFAULT_THRESHOLD = 3;

let jamEnabled = false;
let threshold = getJamCountMinimum() ?? DEFAULT_THRESHOLD;

let currentSongKey: string | null = null;
let currentSongId: string | null = null;
let jammers = new Set<string>();

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

function ensureTrackingForSong(now: NowPlaying): void {
  const key = makeSongKey(now);
  if (currentSongKey !== key) {
    currentSongKey = key;
    currentSongId = now.songId;
    jammers = new Set();
  }
}

export function onNowPlayingUpdated(next: NowPlaying | null): JamFinale | null {
  const prevSongId = currentSongId;
  const prevCount = jammers.size;

  const shouldAnnouncePrev = !!(jamEnabled && prevSongId && prevCount >= threshold);
  const finale: JamFinale | null = shouldAnnouncePrev ? { songId: prevSongId as string, jamCount: prevCount } : null;

  if (!next) {
    currentSongKey = null;
    currentSongId = null;
    jammers = new Set();
    return finale;
  }

  const nextKey = makeSongKey(next);

  // First ever update: start tracking without finalizing anything.
  if (currentSongKey === null) {
    currentSongKey = nextKey;
    currentSongId = next.songId;
    jammers = new Set();
    return null;
  }

  // Song changed: finalize previous song (if applicable), then reset for new.
  if (currentSongKey !== nextKey) {
    currentSongKey = nextKey;
    currentSongId = next.songId;
    jammers = new Set();
    return finale;
  }

  // Same song: keep tracking (but refresh songId in case it changes).
  currentSongId = next.songId;
  return null;
}

export function tryJam(userName: string, now: NowPlaying | null): { jamCount: number; songId: string | null; accepted: boolean } {
  if (!jamEnabled || !now) {
    return { jamCount: jammers.size, songId: currentSongId, accepted: false };
  }

  // Ensure we're tracking the current song; never announce here.
  ensureTrackingForSong(now);

  const userKey = normalizeUser(userName);
  if (!userKey) {
    return { jamCount: jammers.size, songId: currentSongId, accepted: false };
  }

  const had = jammers.has(userKey);
  jammers.add(userKey);

  const count = jammers.size;
  return { jamCount: count, songId: currentSongId, accepted: !had };
}

export function getJamStatus(now: NowPlaying | null): JamStatus {
  return {
    enabled: jamEnabled,
    threshold,
    nowPlaying: now ? { index: now.index, songId: now.songId } : null,
    jamCount: jammers.size
  };
}
