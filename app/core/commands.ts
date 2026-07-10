/**
 * Chat command engine, driven by commands.json in the app data directory.
 *
 * Each command maps a trigger (e.g. "!jam") to an action. The only action
 * today is 'rewrite', which replaces the chat message's text/segments and
 * optionally applies a visual style. New action kinds can be added to
 * CommandDef and dispatched in applyCommand() without changing the file format.
 */
import fs from 'fs';
import path from 'path';
import type { ChatEvent, Segment, SegmentStyle } from '../capture/types';
import { ensureSettingsDirExists } from './settings';

export type CommandDef = {
  /** Exact chat text that triggers the command (matched case-insensitively, trimmed). */
  trigger: string;
  /** What the command does. 'rewrite' replaces the message content. */
  action: 'rewrite';
  /** Replacement content, in overlay segment format. Text segments may carry a style. */
  message: Segment[];
  /** Defaults to true when omitted. */
  enabled?: boolean;
};

/** Built-in defaults, written to commands.json when the file doesn't exist. */
const BUILTIN_COMMANDS: CommandDef[] = [
  {
    trigger: '!jam',
    action: 'rewrite',
    message: [
      { t: 'text', text: 'is jamming! ', style: { bold: true, color: '#ff8b64' } },
      { t: 'emote', url: 'https://cdn.7tv.app/emote/01F6MWBB8R000255K4X1KDFFY5/4x.avif', alt: 'NOTED' },
    ],
    enabled: true,
  },
];

let commands: CommandDef[] = [];

function getCommandsPath(): string {
  return path.join(ensureSettingsDirExists(), 'commands.json');
}

function parseStyle(raw: unknown): SegmentStyle | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const s = raw as Record<string, unknown>;
  const style: SegmentStyle = {};
  if (typeof s.bold === 'boolean') style.bold = s.bold;
  if (typeof s.italic === 'boolean') style.italic = s.italic;
  if (typeof s.color === 'string') style.color = s.color;
  return Object.keys(style).length ? style : undefined;
}

function parseSegment(raw: unknown): Segment | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  if (s.t === 'text' && typeof s.text === 'string') {
    const seg: Segment = { t: 'text', text: s.text };
    const style = parseStyle(s.style);
    if (style) seg.style = style;
    return seg;
  }
  if (s.t === 'emote' && typeof s.url === 'string' && s.url.length > 0) {
    const seg: Segment = { t: 'emote', url: s.url };
    if (typeof s.alt === 'string') seg.alt = s.alt;
    return seg;
  }
  return null;
}

function parseCommand(raw: unknown): CommandDef | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  if (typeof c.trigger !== 'string' || !c.trigger.trim()) return null;
  if (c.action !== 'rewrite') return null;
  if (!Array.isArray(c.message) || c.message.length === 0) return null;
  const segments = c.message.map(parseSegment);
  if (segments.some(s => s === null)) return null;
  const def: CommandDef = {
    trigger: c.trigger.trim(),
    action: 'rewrite',
    message: segments as Segment[],
  };
  if (typeof c.enabled === 'boolean') def.enabled = c.enabled;
  return def;
}

function writeCommandsFile(data: { commands: unknown[] }): void {
  fs.writeFileSync(getCommandsPath(), JSON.stringify(data, null, 2), { encoding: 'utf-8' });
}

/**
 * Load commands.json into memory. Creates the file with built-in defaults if
 * it doesn't exist. If the file is malformed, falls back to built-ins in
 * memory but never overwrites the user's file.
 */
export function loadCommands(): void {
  const filePath = getCommandsPath();
  if (!fs.existsSync(filePath)) {
    try {
      writeCommandsFile({ commands: BUILTIN_COMMANDS });
    } catch (err) {
      console.warn('[Commands] Failed to create commands.json:', err);
    }
    commands = BUILTIN_COMMANDS.map(c => ({ ...c }));
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, { encoding: 'utf-8' }));
  } catch (err) {
    console.warn(`[Commands] commands.json is malformed (${filePath}); using built-in defaults. File left untouched.`, err);
    commands = BUILTIN_COMMANDS.map(c => ({ ...c }));
    return;
  }

  const rawList = (parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).commands))
    ? (parsed as { commands: unknown[] }).commands
    : [];
  const valid: CommandDef[] = [];
  for (const raw of rawList) {
    const def = parseCommand(raw);
    if (def) {
      valid.push(def);
    } else {
      console.warn('[Commands] Skipping invalid command entry in commands.json:', JSON.stringify(raw));
    }
  }
  commands = valid;
}

/** Apply a matched command to a chat message. Dispatches on action kind. */
function applyCommand(def: CommandDef, message: ChatEvent): void {
  switch (def.action) {
    case 'rewrite': {
      message.segments = def.message.map(seg =>
        seg.t === 'text' && seg.style ? { ...seg, style: { ...seg.style } } : { ...seg }
      );
      message.text = def.message
        .map(seg => (seg.t === 'text' ? seg.text : ''))
        .join('')
        .trim();
      break;
    }
  }
}

/** Run chat commands against an incoming message, mutating it if a trigger matches. */
export function runChatCommands(message: ChatEvent): void {
  if (!message) return;
  const text = typeof message.text === 'string' ? message.text.trim().toLowerCase() : '';
  if (!text) return;

  for (const def of commands) {
    if (def.enabled === false) continue;
    if (def.trigger.toLowerCase() === text) {
      applyCommand(def, message);
      return;
    }
  }
}

/** Get the enabled state of a command by trigger (from in-memory state). */
export function getCommandStatus(trigger: string): { trigger: string; enabled: boolean } {
  const key = trigger.trim().toLowerCase();
  const def = commands.find(c => c.trigger.toLowerCase() === key);
  return { trigger, enabled: !!def && def.enabled !== false };
}

/**
 * Set a command's enabled state, persisting to commands.json.
 *
 * Does a fresh read-modify-write so manual edits to other entries and unknown
 * fields are preserved. If the trigger is missing from the file but is a
 * built-in (e.g. "!jam"), the built-in definition is re-added. If the file is
 * malformed, refuses to write (so the user's edits aren't destroyed).
 */
export function setCommandEnabled(trigger: string, enabled: boolean): { ok: boolean; enabled: boolean; error?: string } {
  const key = trigger.trim().toLowerCase();
  const filePath = getCommandsPath();

  let data: { commands: unknown[] };
  if (!fs.existsSync(filePath)) {
    data = { commands: BUILTIN_COMMANDS.map(c => ({ ...c })) };
  } else {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, { encoding: 'utf-8' }));
      const obj = (parsed && typeof parsed === 'object') ? parsed as Record<string, unknown> : {};
      if (!Array.isArray(obj.commands)) obj.commands = [];
      data = obj as unknown as { commands: unknown[] };
    } catch {
      return { ok: false, enabled: getCommandStatus(trigger).enabled, error: 'commands.json is malformed; fix or delete the file and try again.' };
    }
  }

  const entry = data.commands.find(
    (c): c is Record<string, unknown> => !!c && typeof c === 'object' && typeof (c as Record<string, unknown>).trigger === 'string'
      && ((c as Record<string, unknown>).trigger as string).trim().toLowerCase() === key
  );

  if (entry) {
    entry.enabled = enabled;
  } else {
    const builtin = BUILTIN_COMMANDS.find(c => c.trigger.toLowerCase() === key);
    if (!builtin) {
      return { ok: false, enabled: false, error: `Unknown command: ${trigger}` };
    }
    data.commands.push({ ...builtin, enabled });
  }

  try {
    writeCommandsFile(data);
  } catch (err) {
    return { ok: false, enabled: getCommandStatus(trigger).enabled, error: `Failed to write commands.json: ${err}` };
  }

  loadCommands();
  return { ok: true, enabled };
}
