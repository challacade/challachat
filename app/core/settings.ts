import fs from 'fs';
import path from 'path';
import os from 'os';

export type AppSettings = {
  musicPath?: string;
  /** Path to the censor CSV file (user-selected). */
  filterPath?: string;
  /** Optional maximum length for songId strings (e.g. "Title - Artist"). If exceeded, truncates with "...". */

  /** Enable terminal-driven music hotkeys (m, <, >, ?) for controlling the overlay music player. */
  enableMusicHotkeys?: boolean;
  /** Minimum jam count required before the jam finale system message is sent when the song changes. */
  jamCountMinimum?: number;
  /** Song display position on the overlay: 'none', 'top', or 'bottom'. */
  songDisplay?: string;
  /** Write the currently-playing song info to a text file. */
  writeSongFile?: boolean;
  /** Scroll speed for the song display text (0 = off, 1 = 100% = 60px/s). */
  songScrollSpeed?: number;
  /** Extra scale factor for song display text size (0–2, where 1 = 100%). */
  songTextSize?: number;
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

export function updateSettings(patch: Partial<AppSettings>): { ok: boolean; settings: AppSettings } {
  const { settings } = readSettings();
  const merged: AppSettings = { ...settings, ...patch };
  const settingsPath = getSettingsPath();
  ensureSettingsDirExists();
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2), { encoding: 'utf-8' });
    return { ok: true, settings: merged };
  } catch {
    return { ok: false, settings };
  }
}

export function getMusicPath(): string | null {
  const { settings } = readSettings();
  const value = typeof settings.musicPath === 'string' ? settings.musicPath.trim() : '';
  return value.length > 0 ? value : null;
}

export function getMusicSettingsStatus(): { musicPath: string | null; settingsPath: string; autoShuffle: boolean; playlistLoop: boolean; songDisplay: string; writeSongFile: boolean; songScrollSpeed: number; songTextSize: number } {
  const { settings } = readSettings();
  return {
    musicPath: getMusicPath(),
    settingsPath: getSettingsPath(),
    autoShuffle: getAutoShuffle(),
    playlistLoop: getPlaylistLoop(),
    songDisplay: getSongDisplay(),
    writeSongFile: settings.writeSongFile === true,
    songScrollSpeed: typeof settings.songScrollSpeed === 'number' ? settings.songScrollSpeed : 0,
    songTextSize: typeof settings.songTextSize === 'number' ? settings.songTextSize : 1
  };
}

export function getSongDisplay(): string {
  const { settings } = readSettings();
  const val = typeof settings.songDisplay === 'string' ? settings.songDisplay : 'none';
  return ['none', 'top', 'bottom'].includes(val) ? val : 'none';
}

export function getMusicDisplaySettings(): { songDisplay: string; writeSongFile: boolean; songScrollSpeed: number; songTextSize: number } {
  const { settings } = readSettings();
  return {
    songDisplay: getSongDisplay(),
    writeSongFile: settings.writeSongFile === true,
    songScrollSpeed: typeof settings.songScrollSpeed === 'number' ? settings.songScrollSpeed : 0,
    songTextSize: typeof settings.songTextSize === 'number' ? settings.songTextSize : 1
  };
}

export function getEnableMusicHotkeys(): boolean {
  const { settings } = readSettings();
  return (settings as any)?.enableMusicHotkeys === true;
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


