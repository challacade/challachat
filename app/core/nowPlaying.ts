import path from 'path';
import { getTrackByIndex } from './music';


export type NowPlaying = {
  index: number;
  songId: string;
  filePath: string;
  updatedAt: number;
};

export const NO_MUSIC_SONG_ID = 'No music found';

let localCurrent: NowPlaying | null = null;
let externalCurrent: NowPlaying | null = null;
let localPlaybackRunning = false;

function computeSongIdFromPath(filePath: string): string {
  const base = path.basename(filePath, path.extname(filePath));
  return base || 'unknown';
}

export function getNowPlaying(): NowPlaying | null {
  if (localPlaybackRunning && localCurrent) return localCurrent;
  return externalCurrent || localCurrent;
}

export function setNowPlayingByIndex(index: number, songIdOverride?: string | null): NowPlaying | null {
  const filePath = getTrackByIndex(index);
  if (!filePath) {
    localCurrent = null;
    localPlaybackRunning = false;
    return null;
  }

  const override = typeof songIdOverride === 'string' ? songIdOverride.trim() : '';
  const songId = override ? override : computeSongIdFromPath(filePath);

  const next: NowPlaying = {
    index,
    filePath,
    songId,
    updatedAt: Date.now()
  };

  localCurrent = next;
  return next;
}

export function setLocalPlaybackRunning(running: boolean): NowPlaying | null {
  localPlaybackRunning = running && localCurrent !== null;
  return getNowPlaying();
}

/** Set now-playing from an external source (e.g. OS media session). */
export function setNowPlayingExternal(songId: string): NowPlaying {
  const next: NowPlaying = {
    index: -1,
    filePath: '',
    songId: songId || '',
    updatedAt: Date.now()
  };
  externalCurrent = next;
  return next;
}

export function clearExternalNowPlaying(): void {
  externalCurrent = null;
}

export function clearNowPlaying(): void {
  localCurrent = null;
  externalCurrent = null;
  localPlaybackRunning = false;
}
