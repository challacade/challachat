import path from 'path';
import { getTrackByIndex } from './music';
import { truncateSongId } from './settings';

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

export function setNowPlayingByIndex(index: number, songIdOverride?: string | null): NowPlaying | null {
  const filePath = getTrackByIndex(index);
  if (!filePath) {
    current = null;
    return null;
  }

  const override = typeof songIdOverride === 'string' ? songIdOverride.trim() : '';
  const rawSongId = override ? override : computeSongIdFromPath(filePath);
  const songId = truncateSongId(rawSongId);

  const next: NowPlaying = {
    index,
    filePath,
    songId,
    updatedAt: Date.now()
  };

  current = next;
  return next;
}
