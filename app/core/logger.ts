import fs from 'fs';
import path from 'path';
import type { ChatEvent } from '../capture/types';

// Chat message logger that writes messages to JSON Lines files.
// Uses a daily log file named: chat-{date}-{platform}.jsonl
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

function generateLogFilename(platform: string = 'yt'): string {
  const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return `chat-${dateStr}-${platform}.jsonl`;
}

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

  start(platform: string = 'yt'): boolean {
    if (!this.enabled || !customLogsDir) return false;
    try {
      const logsDir = ensureLogsDir();
      if (!logsDir) return false;
      const newPath = path.join(logsDir, generateLogFilename(platform));

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

  write(message: ChatEvent): void {
    if (!this.enabled || !this.stream) return;
    try {
      const entry: Record<string, any> = {
        ts: message.ts,
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
const spoof = new LogChannel('Logger/Spoof');

// ── Real capture logging ──────────────────────────────────────

export function setLogEnabled(enabled: boolean): void { main.setEnabled(enabled); }
export function startLogging(platform: string = 'yt'): boolean { return main.start(platform); }
export function stopLogging(): void { main.stop(); }
export function logMessage(message: ChatEvent): void { main.write(message); }

// ── Spoof logging ─────────────────────────────────────────────

export function setLogSpoofEnabled(enabled: boolean): void { spoof.setEnabled(enabled); }
export function startSpoofLogging(): boolean { return spoof.start('spoof'); }
export function stopSpoofLogging(): void { spoof.stop(); }
export function logSpoofMessage(message: ChatEvent): void { spoof.write(message); }

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
    spoofEnabled: spoof.isEnabled,
  };
}
