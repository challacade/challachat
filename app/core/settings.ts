import fs from 'fs';
import path from 'path';
import os from 'os';

export type ConnectionHistoryItem = {
  key: string;
  type: 'stream' | 'spoof';
  label: string;
  url?: string;
  platform?: string;
  preset?: string;
  lastConnectedAt: number;
};

type HistoryFile = {
  connections?: ConnectionHistoryItem[];
};

export type AppSettings = {
  // ── Music & song display ──
  musicPath?: string;
  /** Automatically shuffle the playlist when it first loads. */
  autoShuffle?: boolean;
  /** Loop the playlist when it reaches the end. Defaults to true if not specified. */
  playlistLoop?: boolean;
  /** Song display position on the overlay: 'none', 'top', or 'bottom'. */
  songDisplay?: string;
  /** Write the currently-playing song info to a text file. */
  writeSongFile?: boolean;
  /** Custom file path for the song text file. */
  songFilePath?: string;
  /** Scroll speed for the song display text (0 = off, 1 = 100% = 60px/s). */
  songScrollSpeed?: number;
  /** Extra scale factor for song display text size (0-2, where 1 = 100%). */
  songTextSize?: number;

  // ── Filter ──
  /** Path to the censor CSV file (user-selected). */
  filterPath?: string;
  /** Whether the profanity filter is active. */
  filterActive?: boolean;

  // ── Appearance ──
  scale?: number;
  textOpacity?: number;
  bubbleOpacity?: number;
  bgOpacity?: number;
  messageGap?: number;
  textColor?: string;
  bubbleColor?: string;
  bgColor?: string;
  showBubbles?: boolean;
  showAvatars?: boolean;
  showBadges?: boolean;
  preset?: string;
  overlayFont?: string;
  messageFlow?: string;
  edgePadding?: number;
  textShadow?: number;
  transitionSpeed?: number;
  texture?: string;
  textureIntensity?: number;
  textureScale?: number;
  textureGap?: number;
  textureColor?: string;

  // ── Sound volumes ──
  messageVolume?: number;
  donationVolume?: number;
  memberVolume?: number;

  // ── Music playback ──
  musicVolume?: number;
  musicPan?: number;
  /** Show OS media-session data when local music is not playing. */
  externalMusicData?: boolean;
  /** Legacy player mode, retained only to migrate external-player users. */
  musicMode?: string;

  // ── Custom sound file paths ──
  messageSoundPath?: string;
  donationSoundPath?: string;
  memberSoundPath?: string;

  // ── Toggles ──
  loggerEnabled?: boolean;
  logSpoofEnabled?: boolean;

  // ── Logger ──
  /** Custom folder for chat log files. */
  logFolderPath?: string;


  // ── UI ──
  uiZoom?: number;
  uiTheme?: string;
  filmingMode?: boolean;
  pollIntervalMs?: number;

  // ── Window ──
  windowWidth?: number;
  windowHeight?: number;
  windowX?: number;
  windowY?: number;
  windowMaximized?: boolean;
};

function getSettingsDir(): string {
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, 'ChallaChat');
  }
  return path.join(os.homedir(), '.challachat');
}

export function ensureSettingsDirExists(): string {
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

function getSettingsPath(): string {
  return path.join(getSettingsDir(), 'settings.json');
}

function getHistoryPath(): string {
  return path.join(getSettingsDir(), 'history.json');
}

export function writeSongTxt(line: string): { ok: boolean; path: string } {
  const { settings } = readSettings();
  const songPath = (typeof settings.songFilePath === 'string' && settings.songFilePath.trim())
    ? settings.songFilePath.trim()
    : path.join(ensureSettingsDirExists(), 'song.txt');
  try {
    const dir = path.dirname(songPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
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

/** Write via temp file + rename so a crash mid-write never leaves a truncated file. */
function writeJsonAtomic(filePath: string, data: unknown): void {
  const json = JSON.stringify(data, null, 2);
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, json, { encoding: 'utf-8' });
  try {
    fs.renameSync(tmpPath, filePath);
  } catch {
    // Windows can refuse the rename while another process (e.g. antivirus) holds the target open.
    fs.writeFileSync(filePath, json, { encoding: 'utf-8' });
    try { fs.rmSync(tmpPath, { force: true }); } catch { /* ignore */ }
  }
}

type SettingsLoad = { settings: AppSettings; state: 'ok' | 'corrupt' | 'unreadable' };

function loadSettingsFile(settingsPath: string): SettingsLoad {
  ensureSettingsFileExists();
  let raw: string;
  try {
    raw = fs.readFileSync(settingsPath, 'utf-8');
  } catch {
    return { settings: {}, state: 'unreadable' };
  }
  try {
    const parsed = JSON.parse(raw || '{}');
    return { settings: (parsed && typeof parsed === 'object') ? parsed : {}, state: 'ok' };
  } catch {
    return { settings: {}, state: 'corrupt' };
  }
}

export function readSettings(): { settings: AppSettings; exists: boolean; path: string } {
  const settingsPath = getSettingsPath();
  const { settings, state } = loadSettingsFile(settingsPath);
  return { settings, exists: state === 'ok', path: settingsPath };
}

export function updateSettings(patch: Partial<AppSettings>): { ok: boolean; settings: AppSettings } {
  const settingsPath = getSettingsPath();
  const { settings, state } = loadSettingsFile(settingsPath);
  // Never overwrite a file we couldn't read: that would drop every setting not in this patch.
  if (state === 'unreadable') return { ok: false, settings };
  if (state === 'corrupt') {
    const backupPath = `${settingsPath}.corrupt-${Date.now()}.bak`;
    try {
      fs.copyFileSync(settingsPath, backupPath);
      console.warn(`[Settings] settings.json was not valid JSON; backed up to ${backupPath} and starting fresh.`);
    } catch {
      return { ok: false, settings };
    }
  }
  const merged: AppSettings = { ...settings, ...patch };
  try {
    writeJsonAtomic(settingsPath, merged);
    return { ok: true, settings: merged };
  } catch {
    return { ok: false, settings };
  }
}

export function getConnectionHistory(): ConnectionHistoryItem[] {
  const historyPath = getHistoryPath();
  ensureSettingsDirExists();

  try {
    if (fs.existsSync(historyPath)) {
      const raw = fs.readFileSync(historyPath, 'utf-8');
      const parsed = JSON.parse(raw || '{}') as HistoryFile | ConnectionHistoryItem[];
      if (Array.isArray(parsed)) return parsed;
      return Array.isArray(parsed?.connections) ? parsed.connections : [];
    }
  } catch {
    return [];
  }

  const legacy = (readSettings().settings as Record<string, unknown>).connectionHistory;
  return Array.isArray(legacy) ? legacy as ConnectionHistoryItem[] : [];
}

export function addConnectionHistory(item: Omit<ConnectionHistoryItem, 'lastConnectedAt'>): ConnectionHistoryItem[] {
  const nextItem: ConnectionHistoryItem = { ...item, lastConnectedAt: Date.now() };
  const existing = getConnectionHistory().filter(entry => entry.key !== nextItem.key);
  const next = [nextItem, ...existing].slice(0, 50);
  ensureSettingsDirExists();
  try {
    writeJsonAtomic(getHistoryPath(), { connections: next });
  } catch {
    // ignore - history is non-critical
  }
  return next;
}

export function getMusicPath(): string | null {
  const { settings } = readSettings();
  const value = typeof settings.musicPath === 'string' ? settings.musicPath.trim() : '';
  return value.length > 0 ? value : null;
}

function parseSongDisplay(settings: AppSettings): string {
  const val = typeof settings.songDisplay === 'string' ? settings.songDisplay : 'none';
  return ['none', 'top', 'bottom'].includes(val) ? val : 'none';
}

export function getMusicSettingsStatus(): { musicPath: string | null; settingsPath: string; autoShuffle: boolean; playlistLoop: boolean; songDisplay: string; writeSongFile: boolean; songFilePath: string; songScrollSpeed: number; songTextSize: number; musicVolume: number; musicPan: number; externalMusicData: boolean } {
  const { settings } = readSettings();
  const musicPathVal = typeof settings.musicPath === 'string' ? settings.musicPath.trim() : '';
  return {
    musicPath: musicPathVal.length > 0 ? musicPathVal : null,
    settingsPath: getSettingsPath(),
    autoShuffle: settings.autoShuffle === true,
    playlistLoop: settings.playlistLoop !== false,
    songDisplay: parseSongDisplay(settings),
    writeSongFile: settings.writeSongFile === true,
    songFilePath: typeof settings.songFilePath === 'string' ? settings.songFilePath : '',
    songScrollSpeed: typeof settings.songScrollSpeed === 'number' ? settings.songScrollSpeed : 0,
    songTextSize: typeof settings.songTextSize === 'number' ? settings.songTextSize : 1,
    musicVolume: typeof settings.musicVolume === 'number' ? settings.musicVolume : 1,
    musicPan: typeof settings.musicPan === 'number' ? settings.musicPan : 0,
    externalMusicData: settings.externalMusicData === true
      || (settings.externalMusicData === undefined && settings.musicMode === 'external'),
  };
}

export function getMusicDisplaySettings(): { songDisplay: string; writeSongFile: boolean; songFilePath: string; songScrollSpeed: number; songTextSize: number } {
  const { settings } = readSettings();
  return {
    songDisplay: parseSongDisplay(settings),
    writeSongFile: settings.writeSongFile === true,
    songFilePath: typeof settings.songFilePath === 'string' ? settings.songFilePath : '',
    songScrollSpeed: typeof settings.songScrollSpeed === 'number' ? settings.songScrollSpeed : 0,
    songTextSize: typeof settings.songTextSize === 'number' ? settings.songTextSize : 1
  };
}

// ── Appearance defaults ──
const APPEARANCE_DEFAULTS: Record<string, number | string | boolean> = {
  scale: 1.35,
  textOpacity: 1,
  bubbleOpacity: 0.14,
  bgOpacity: 0,
  messageGap: 0.4,
  textColor: '#ffffff',
  bubbleColor: '#000000',
  bgColor: '#000000',
  showBubbles: true,
  showAvatars: true,
  showBadges: true,
  preset: 'Dark',
  overlayFont: 'Inter',
  messageFlow: 'bottom-up',
  edgePadding: 0.5,
  textShadow: 0.25,
  transitionSpeed: 8,
  texture: 'none',
  textureIntensity: 0.25,
  textureScale: 1,
  textureGap: 1,
  textureColor: '#ffffff',
};

// ── Sound defaults ──
const SOUND_DEFAULTS: Record<string, number | string> = {
  messageVolume: 0,
  donationVolume: 1,
  memberVolume: 1,
  messageSoundPath: '',
  donationSoundPath: '',
  memberSoundPath: '',
};

/** Load saved appearance, merging with defaults for any missing keys. */
export function getSavedAppearance(): Record<string, number | string | boolean> {
  const { settings } = readSettings();
  const result = { ...APPEARANCE_DEFAULTS };
  const record = settings as Record<string, unknown>;
  for (const key of Object.keys(APPEARANCE_DEFAULTS)) {
    const val = record[key];
    if (val !== undefined) result[key] = val as number | string | boolean;
  }
  return result;
}

/** Load saved sound volumes and paths, merging with defaults for any missing keys. */
export function getSavedSounds(): Record<string, number | string> {
  const { settings } = readSettings();
  const result = { ...SOUND_DEFAULTS };
  const record = settings as Record<string, unknown>;
  for (const key of Object.keys(SOUND_DEFAULTS)) {
    const val = record[key];
    if (val !== undefined && (typeof val === 'number' || typeof val === 'string')) result[key] = val;
  }
  return result;
}

/** Load saved toggle states (filter active, logger). All default to false. */
export function getSavedToggles(): { filterActive: boolean; loggerEnabled: boolean; logSpoofEnabled: boolean } {
  const { settings } = readSettings();
  return {
    filterActive: settings.filterActive === true,
    loggerEnabled: settings.loggerEnabled === true,
    logSpoofEnabled: settings.logSpoofEnabled === true,
  };
}