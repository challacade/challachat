import fs from 'fs';
import path from 'path';
import os from 'os';
import type { ChatEvent } from '../capture/types';

// Chat message logger that writes messages to JSON Lines files.
// Each session creates a new log file named: chat-{videoId}-{date}.jsonl

let logEnabled = false;
let logStream: fs.WriteStream | null = null;
let currentLogPath: string | null = null;
let currentVideoId: string | null = null;
let messageCount = 0;

// Get the logs directory path
function getLogsDir(): string {
  // Windows: %LOCALAPPDATA%\ChallaChat\logs
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, 'ChallaChat', 'logs');
  }
  // Linux/Mac: ~/.challachat/logs
  return path.join(os.homedir(), '.challachat', 'logs');
}

// Ensure the logs directory exists
function ensureLogsDir(): string {
  const logsDir = getLogsDir();
  try {
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
  } catch (err) {
    console.error(`[Logger] Failed to create logs directory: ${err}`);
  }
  return logsDir;
}

// Generate a log filename for the current session
function generateLogFilename(videoId: string): string {
  const date = new Date();
  const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
  const timeStr = date.toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS
  // Sanitize videoId to be filesystem-safe
  const safeVideoId = videoId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `chat-${safeVideoId}-${dateStr}_${timeStr}.jsonl`;
}

// Start logging for a new capture session
export function startLogging(videoId: string): boolean {
  if (!logEnabled) return false;
  
  try {
    // Close any existing stream
    stopLogging();
    
    const logsDir = ensureLogsDir();
    const filename = generateLogFilename(videoId);
    currentLogPath = path.join(logsDir, filename);
    currentVideoId = videoId;
    messageCount = 0;
    
    // Open write stream in append mode
    logStream = fs.createWriteStream(currentLogPath, { flags: 'a', encoding: 'utf-8' });
    
    logStream.on('error', (err) => {
      console.error(`[Logger] Write error: ${err.message}`);
    });
    
    console.log(`[Logger] Started logging to ${currentLogPath}`);
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
    } catch {}
    logStream = null;
  }
  if (currentLogPath && messageCount > 0) {
    console.log(`[Logger] Stopped logging. ${messageCount} messages written to ${path.basename(currentLogPath)}`);
  }
  currentLogPath = null;
  currentVideoId = null;
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
    
    // Include message ID for reference
    if (message.id) {
      entry.id = message.id;
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

// Check if logging is enabled
export function isLogEnabled(): boolean {
  return logEnabled;
}

// Get logger status for API
export function getLoggerStatus(): {
  enabled: boolean;
  logging: boolean;
  path: string | null;
  messageCount: number;
  logsDir: string;
} {
  return {
    enabled: logEnabled,
    logging: logStream !== null,
    path: currentLogPath,
    messageCount,
    logsDir: getLogsDir()
  };
}
