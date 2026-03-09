import fs from 'fs';
import path from 'path';
import type { ChatEvent } from '../capture/types';

// Chat message logger that writes messages to JSON Lines files.
// Uses a daily log file named: chat-{date}-{platform}.jsonl
// Appends to existing file if it exists for the same day.

let logEnabled = false;
let logStream: fs.WriteStream | null = null;
let currentLogPath: string | null = null;
let messageCount = 0;
let customLogsDir: string | null = null;

// Get the logs directory path (returns null if no folder is set)
function getLogsDir(): string | null {
  return customLogsDir;
}

// Set a custom logs directory (empty string clears it)
export function setLogsDir(dir: string): void {
  customLogsDir = dir || null;
}

// Ensure the logs directory exists
function ensureLogsDir(): string | null {
  const logsDir = getLogsDir();
  if (!logsDir) return null;
  try {
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
  } catch (err) {
    console.error(`[Logger] Failed to create logs directory: ${err}`);
  }
  return logsDir;
}

// Generate a log filename for today (platform-based, daily file)
function generateLogFilename(platform: string = 'yt'): string {
  const date = new Date();
  const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
  return `chat-${dateStr}-${platform}.jsonl`;
}

// Start logging for a new capture session
export function startLogging(platform: string = 'yt'): boolean {
  if (!logEnabled || !customLogsDir) return false;
  
  try {
    const logsDir = ensureLogsDir();
    if (!logsDir) return false;
    const filename = generateLogFilename(platform);
    const newLogPath = path.join(logsDir, filename);
    
    // If already logging to the same file, just continue
    if (logStream && currentLogPath === newLogPath) {
      return true;
    }
    
    // Close any existing stream to a different file
    stopLogging();
    
    currentLogPath = newLogPath;
    
    // Check if file already exists (we'll append to it)
    const fileExists = fs.existsSync(currentLogPath);
    
    // Open write stream in append mode
    logStream = fs.createWriteStream(currentLogPath, { flags: 'a', encoding: 'utf-8' });
    
    logStream.on('error', (err) => {
      console.error(`[Logger] Write error: ${err.message}`);
    });
    
    if (fileExists) {
      console.log(`[Logger] Appending to: ${currentLogPath}`);
    } else {
      console.log(`[Logger] Writing to: ${currentLogPath}`);
    }
    return true;
  } catch (err) {
    console.error(`[Logger] Failed to start logging: ${err}`);
    return false;
  }
}

// Stop logging and close the file stream
export function stopLogging(): void {
  if (logStream) {
    try {
      logStream.end();
    } catch { /* ignore – best-effort stream close */ }
    logStream = null;
  }
  if (currentLogPath && messageCount > 0) {
    console.log(`[Logger] Stopped logging. ${messageCount} messages written to ${path.basename(currentLogPath)}`);
  }
  currentLogPath = null;
  messageCount = 0;
}

// Log a single chat message
export function logMessage(message: ChatEvent): void {
  if (!logEnabled || !logStream) return;
  
  try {
    // Create a minimal log entry with essential fields
    const entry: Record<string, any> = {
      ts: message.ts,
      author: message.author?.name || 'Unknown',
      text: message.text || '',
      kind: message.kind
    };
    
    // Include donation amount if present
    if (message.amountDisplay) {
      entry.amount = message.amountDisplay;
    }
    
    // Write as a single JSON line
    logStream.write(JSON.stringify(entry) + '\n');
    messageCount++;
  } catch (err) {
    // Silently ignore write errors to not disrupt the main flow
  }
}

// Enable or disable logging
export function setLogEnabled(enabled: boolean): void {
  logEnabled = enabled;
  
  if (!enabled) {
    stopLogging();
  }
}

// Get logger status for API
export function getLoggerStatus(): {
  enabled: boolean;
  logging: boolean;
  path: string | null;
  messageCount: number;
  logFolderPath: string;
} {
  return {
    enabled: logEnabled,
    logging: logStream !== null,
    path: currentLogPath,
    messageCount,
    logFolderPath: customLogsDir || ''
  };
}
