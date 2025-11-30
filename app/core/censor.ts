import fs from 'fs';
import path from 'path';
import os from 'os';
import type { ChatEvent, Segment } from '../capture/types';

// Profanity filter that loads bad words from a CSV file and censors them in chat messages.
// Words are censored by keeping the first letter and replacing the rest with asterisks.

let badWords: Set<string> = new Set();
let filterLoaded = false;  // Whether a CSV was found and loaded
let filterActive = true;   // Whether censoring is currently enabled (user toggle)
let loadedPath: string | null = null;

// Possible locations for the censor CSV file (checked in order)
function getCensorPaths(): string[] {
  const paths: string[] = [];
  
  // 1. Beside the executable (for portable builds)
  try {
    const exeDir = path.dirname(process.execPath);
    paths.push(path.join(exeDir, 'censor.csv'));
  } catch {}
  
  // 2. Current working directory
  paths.push(path.join(process.cwd(), 'censor.csv'));
  
  // 3. User's home directory under .challachat
  try {
    const homeDir = os.homedir();
    paths.push(path.join(homeDir, '.challachat', 'censor.csv'));
  } catch {}
  
  // 4. Windows AppData Local (if on Windows)
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    paths.push(path.join(process.env.LOCALAPPDATA, 'ChallaChat', 'censor.csv'));
  }
  
  return paths;
}

// Parse CSV content into a set of lowercase words
function parseCSV(content: string): Set<string> {
  const words = new Set<string>();
  
  // Split by newlines and commas, trim whitespace, lowercase
  const lines = content.split(/[\r\n]+/);
  for (const line of lines) {
    // Support both one-word-per-line and comma-separated
    const parts = line.split(',');
    for (const part of parts) {
      const word = part.trim().toLowerCase();
      if (word.length > 0) {
        words.add(word);
      }
    }
  }
  
  return words;
}

// Load the censor list from the first available CSV file
export function loadFilter(): boolean {
  const paths = getCensorPaths();
  
  for (const filePath of paths) {
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        badWords = parseCSV(content);
        
        if (badWords.size > 0) {
          filterLoaded = true;
          loadedPath = filePath;
          console.log(`[Censor] Loaded ${badWords.size} words from ${filePath}`);
          return true;
        }
      }
    } catch (err) {
      // Continue to next path
    }
  }
  
  filterLoaded = false;
  loadedPath = null;
  return false;
}

// Reload the filter (can be called to refresh after file changes)
export function reloadFilter(): boolean {
  badWords.clear();
  filterLoaded = false;
  loadedPath = null;
  return loadFilter();
}

// Get filter status for debugging/UI
export function getFilterStatus(): { loaded: boolean; active: boolean; wordCount: number; path: string | null } {
  return {
    loaded: filterLoaded,
    active: filterActive,
    wordCount: badWords.size,
    path: loadedPath
  };
}

// Enable or disable the censor filter at runtime
export function setFilterActive(active: boolean): void {
  filterActive = active;
}

// Check if censoring is currently effective (loaded AND active)
function isCensoringEnabled(): boolean {
  return filterLoaded && filterActive && badWords.size > 0;
}

// Censor a single word: keep first letter, replace rest with asterisks
// Example: "fuck" → "f***", "damn" → "d***"
function censorWord(word: string): string {
  if (word.length <= 1) {
    return '*';
  }
  return word[0] + '*'.repeat(word.length - 1);
}

// Censor text by replacing bad words (case-insensitive, word boundaries)
export function censorText(text: string): string {
  if (!isCensoringEnabled() || !text) {
    return text;
  }
  
  let result = text;
  
  // Build a regex pattern for all bad words with word boundaries
  // We process each bad word individually to handle overlapping matches correctly
  for (const badWord of badWords) {
    // Escape special regex characters in the bad word
    const escaped = badWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Use word boundaries for whole-word matching, case-insensitive
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
    
    result = result.replace(regex, (match) => censorWord(match));
  }
  
  return result;
}

// Censor segments array (for messages with emotes mixed in)
function censorSegments(segments: Segment[]): Segment[] {
  return segments.map(segment => {
    if (segment.t === 'text' && segment.text) {
      return { ...segment, text: censorText(segment.text) };
    }
    return segment;
  });
}

// Censor an entire chat message (both text and segments)
export function censorMessage(message: ChatEvent): ChatEvent {
  if (!isCensoringEnabled()) {
    return message;
  }
  
  const censored: ChatEvent = { ...message };
  
  // Censor the main text field
  if (censored.text) {
    censored.text = censorText(censored.text);
  }
  
  // Censor segments if present
  if (censored.segments && censored.segments.length > 0) {
    censored.segments = censorSegments(censored.segments);
  }
  
  return censored;
}

// Auto-load filter on module import
loadFilter();
