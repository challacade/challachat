import fs from 'fs';
import path from 'path';
import type { ChatEvent } from '../capture/types';

// Chat message logger that writes messages to JSON Lines files.
// Uses a daily log file named: chat-{date}.jsonl
// Appends to existing file if it exists for the same day.

let customLogsDir: string | null = null;

export function setLogsDir(dir: string): void {
  customLogsDir = dir || null;
}

function ensureLogsDir(): string | null {
  if (!customLogsDir) return null;
  try {
    if (!fs.existsSync(customLogsDir)) {
      fs.mkdirSync(customLogsDir, { recursive: true });
    }
  } catch (err) {
    console.error(`[Logger] Failed to create logs directory: ${err}`);
  }
  return customLogsDir;
}

function generateLogFilename(): string {
  const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return `chat-${dateStr}.jsonl`;
}

export type LogPlatform = 'youtube' | 'twitch' | 'kick' | 'spoof';

const SITE_CODES: Record<LogPlatform, string> = {
  youtube: 'yt',
  twitch: 'tw',
  kick: 'kk',
  spoof: 'spoof',
};

// ── Shared channel implementation ─────────────────────────────

class LogChannel {
  private enabled = false;
  private stream: fs.WriteStream | null = null;
  private logPath: string | null = null;
  private count = 0;
  private readonly tag: string;

  constructor(tag: string) {
    this.tag = tag;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.stop();
  }

  start(): boolean {
    if (!this.enabled || !customLogsDir) return false;
    try {
      const logsDir = ensureLogsDir();
      if (!logsDir) return false;
      const newPath = path.join(logsDir, generateLogFilename());

      if (this.stream && this.logPath === newPath) return true;
      this.stop();

      this.logPath = newPath;
      const fileExists = fs.existsSync(newPath);
      this.stream = fs.createWriteStream(newPath, { flags: 'a', encoding: 'utf-8' });
      this.stream.on('error', (err) => console.error(`[${this.tag}] Write error: ${err.message}`));
      console.log(`[${this.tag}] ${fileExists ? 'Appending to' : 'Writing to'}: ${newPath}`);
      return true;
    } catch (err) {
      console.error(`[${this.tag}] Failed to start logging: ${err}`);
      return false;
    }
  }

  stop(): void {
    if (this.stream) {
      try { this.stream.end(); } catch { /* ignore */ }
      this.stream = null;
    }
    if (this.logPath && this.count > 0) {
      console.log(`[${this.tag}] Stopped. ${this.count} messages written to ${path.basename(this.logPath)}`);
    }
    this.logPath = null;
    this.count = 0;
  }

  write(message: ChatEvent, platform: LogPlatform): void {
    if (!this.enabled || !this.stream) return;
    try {
      const entry: Record<string, any> = {
        ts: message.ts,
        site: SITE_CODES[platform],
        author: message.author?.name || 'Unknown',
        text: message.text || '',
        kind: message.kind,
      };
      if (message.amountDisplay) entry.amount = message.amountDisplay;
      this.stream.write(JSON.stringify(entry) + '\n');
      this.count++;
    } catch {
      // Silently ignore write errors to not disrupt the main flow
    }
  }

  get isEnabled(): boolean { return this.enabled; }
  get isLogging(): boolean { return this.stream !== null; }
  get currentPath(): string | null { return this.logPath; }
  get messageCount(): number { return this.count; }
}

const main = new LogChannel('Logger');
let spoofEnabled = false;

export function setLogEnabled(enabled: boolean): void { main.setEnabled(enabled); }
export function setLogSpoofEnabled(enabled: boolean): void { spoofEnabled = enabled; }
export function startLogging(): boolean { return main.start(); }
export function stopLogging(): void { main.stop(); }
export function logMessage(message: ChatEvent, platform: LogPlatform): void {
  if (platform === 'spoof' && !spoofEnabled) return;
  main.write(message, platform);
}

// ── Status ────────────────────────────────────────────────────

export function getLoggerStatus(): {
  enabled: boolean;
  logging: boolean;
  path: string | null;
  messageCount: number;
  logFolderPath: string;
  spoofEnabled: boolean;
} {
  return {
    enabled: main.isEnabled,
    logging: main.isLogging,
    path: main.currentPath,
    messageCount: main.messageCount,
    logFolderPath: customLogsDir || '',
    spoofEnabled,
  };
}
