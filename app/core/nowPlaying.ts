import path from 'path';
import { getTrackByIndex } from './music';

export type NowPlaying = {
  index: number;
  songId: string;
  filePath: string;
  updatedAt: number;
};

let current: NowPlaying | null = null;

function computeSongIdFromPath(filePath: string): string {
  const base = path.basename(filePath, path.extname(filePath));
  return base || 'unknown';
}

export function getNowPlaying(): NowPlaying | null {
  return current;
}

export function setNowPlayingByIndex(index: number): NowPlaying | null {
  const filePath = getTrackByIndex(index);
  if (!filePath) {
    current = null;
    return null;
  }

  const next: NowPlaying = {
    index,
    filePath,
    songId: computeSongIdFromPath(filePath),
    updatedAt: Date.now()
  };

  current = next;
  return next;
}
