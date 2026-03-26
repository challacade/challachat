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

export function setNowPlayingByIndex(index: number, songIdOverride?: string | null): NowPlaying | null {
  const filePath = getTrackByIndex(index);
  if (!filePath) {
    current = null;
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

  current = next;
  return next;
}

/** Set now-playing from an external source (e.g. OS media session). */
export function setNowPlayingExternal(songId: string): NowPlaying {
  const next: NowPlaying = {
    index: -1,
    filePath: '',
    songId: songId || '',
    updatedAt: Date.now()
  };
  current = next;
  return next;
}

export function clearNowPlaying(): void {
  current = null;
}
