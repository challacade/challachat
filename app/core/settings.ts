import fs from 'fs';
import path from 'path';
import os from 'os';

export type AppSettings = {
  musicPath?: string;
  /** Optional maximum length for songId strings (e.g. "Title - Artist"). If exceeded, truncates with "...". */
  maxSongIdLength?: number;
  /** Enable terminal-driven music hotkeys (m, <, >, ?) for controlling the overlay music player. */
  enableMusicHotkeys?: boolean;
  /** Minimum jam count required before the jam finale system message is sent when the song changes. */
  jamCountMinimum?: number;
  /** Automatically shuffle the playlist when it first loads. */
  autoShuffle?: boolean;
  /** Loop the playlist when it reaches the end. Defaults to true if not specified. */
  playlistLoop?: boolean;
  /** When true, replaces the ♫ music-note characters with spaces in the song.txt output. */
  disableSongIdNotes?: boolean;
};

function getSettingsDir(): string {
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, 'ChallaChat');
  }
  return path.join(os.homedir(), '.challachat');
}

function ensureSettingsDirExists(): string {
  const settingsDir = getSettingsDir();
  try {
    if (!fs.existsSync(settingsDir)) {
      fs.mkdirSync(settingsDir, { recursive: true });
    }
  } catch {
    // ignore
  }
  return settingsDir;
}

export function getSettingsPath(): string {
  return path.join(getSettingsDir(), 'settings.json');
}

export function getSongTxtPath(): string {
  return path.join(getSettingsDir(), 'song.txt');
}

export function writeSongTxt(line: string): { ok: boolean; path: string } {
  const settingsDir = ensureSettingsDirExists();
  const songPath = path.join(settingsDir, 'song.txt');
  try {
    fs.writeFileSync(songPath, String(line ?? ''), { encoding: 'utf-8' });
    return { ok: true, path: songPath };
  } catch {
    return { ok: false, path: songPath };
  }
}

function ensureSettingsFileExists(): void {
  const settingsPath = getSettingsPath();
  ensureSettingsDirExists();

  try {
    if (!fs.existsSync(settingsPath)) {
      fs.writeFileSync(settingsPath, JSON.stringify({}, null, 2), { encoding: 'utf-8' });
    }
  } catch {
    // ignore
  }
}

export function readSettings(): { settings: AppSettings; exists: boolean; path: string } {
  const settingsPath = getSettingsPath();
  ensureSettingsFileExists();

  try {
    const raw = fs.readFileSync(settingsPath, 'utf-8');
    const parsed = JSON.parse(raw || '{}');
    const settings: AppSettings = (parsed && typeof parsed === 'object') ? parsed : {};
    return { settings, exists: true, path: settingsPath };
  } catch {
    return { settings: {}, exists: false, path: settingsPath };
  }
}

export function getMusicPath(): string | null {
  const { settings } = readSettings();
  const value = typeof settings.musicPath === 'string' ? settings.musicPath.trim() : '';
  return value.length > 0 ? value : null;
}

export function getMusicSettingsStatus(): { musicPath: string | null; settingsPath: string; autoShuffle: boolean; playlistLoop: boolean } {
  return {
    musicPath: getMusicPath(),
    settingsPath: getSettingsPath(),
    autoShuffle: getAutoShuffle(),
    playlistLoop: getPlaylistLoop()
  };
}

export function getEnableMusicHotkeys(): boolean {
  const { settings } = readSettings();
  return (settings as any)?.enableMusicHotkeys === true;
}

export function getMaxSongIdLength(): number | null {
  const { settings } = readSettings();
  const raw = (settings as any)?.maxSongIdLength;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const i = Math.floor(n);
  return i > 0 ? i : null;
}

export function getJamCountMinimum(): number | null {
  const { settings } = readSettings();
  const raw = (settings as any)?.jamCountMinimum;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const i = Math.floor(n);
  return i > 0 ? i : null;
}

export function getAutoShuffle(): boolean {
  const { settings } = readSettings();
  return (settings as any)?.autoShuffle === true;
}

export function getPlaylistLoop(): boolean {
  const { settings } = readSettings();
  // Default to true if not explicitly set to false
  return (settings as any)?.playlistLoop !== false;
}

export function getDisableSongIdNotes(): boolean {
  const { settings } = readSettings();
  return (settings as any)?.disableSongIdNotes === true;
}

export function truncateSongId(songId: string): string {
  const s = String(songId ?? '');
  const max = getMaxSongIdLength();
  if (!max) return s;
  if (s.length <= max) return s;
  if (max <= 3) return '...'.slice(0, max);
  return s.slice(0, Math.max(0, max - 3)).trimEnd() + '...';
}
