import fs from 'fs';
import path from 'path';
import { getMusicPath } from './settings';

type PlaylistCache = {
  sourcePath: string | null;
  tracks: string[];
  scannedAt: number;
  titleByPath: Map<string, string | null>;
};

const cache: PlaylistCache = {
  sourcePath: null,
  tracks: [],
  scannedAt: 0,
  titleByPath: new Map()
};

function isMp3(filePath: string): boolean {
  return path.extname(filePath).toLowerCase() === '.mp3';
}

function safeReadDir(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function buildPlaylist(rootDir: string): string[] {
  const results: string[] = [];
  const stack: string[] = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    const entries = safeReadDir(current);
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (entry.isFile() && isMp3(full)) {
        results.push(full);
      }
    }
  }

  // Deterministic order (so “next song” is stable)
  results.sort((a, b) => a.localeCompare(b));
  return results;
}

export function refreshPlaylist(): { musicPath: string | null; playlist: string[]; scannedAt: number } {
  const musicPath = getMusicPath();

  if (!musicPath) {
    cache.sourcePath = null;
    cache.tracks = [];
    cache.titleByPath.clear();
    cache.scannedAt = Date.now();
    return { musicPath: null, playlist: [], scannedAt: cache.scannedAt };
  }

  // Rebuild on demand (simple and predictable)
  cache.sourcePath = musicPath;
  cache.tracks = buildPlaylist(musicPath);
  cache.titleByPath.clear();
  cache.scannedAt = Date.now();
  return { musicPath, playlist: cache.tracks, scannedAt: cache.scannedAt };
}

export function getPlaylist(): { musicPath: string | null; playlist: string[]; scannedAt: number } {
  // Ensure we have a playlist constructed at least once
  if (cache.scannedAt === 0) {
    return refreshPlaylist();
  }
  return { musicPath: cache.sourcePath, playlist: cache.tracks, scannedAt: cache.scannedAt };
}

export function getTrackByIndex(index: number): string | null {
  const { playlist } = getPlaylist();
  if (!Number.isInteger(index) || index < 0 || index >= playlist.length) return null;
  return playlist[index] || null;
}

export async function getTrackTitleByIndex(index: number): Promise<string | null> {
  const filePath = getTrackByIndex(index);
  if (!filePath) return null;

  const cached = cache.titleByPath.get(filePath);
  if (cached !== undefined) return cached;

  try {
    // Use dynamic import so this works in CommonJS output reliably.
    const mm = await import('music-metadata');
    const meta = await mm.parseFile(filePath, { duration: false });
    const titleRaw = meta.common?.title;
    const title = typeof titleRaw === 'string' ? titleRaw.trim() : '';
    const finalTitle = title ? title : null;
    cache.titleByPath.set(filePath, finalTitle);
    return finalTitle;
  } catch {
    cache.titleByPath.set(filePath, null);
    return null;
  }
}
