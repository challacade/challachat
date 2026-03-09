import type { Server as SocketIOServer } from 'socket.io';
import type { SSEHub } from '../../core/sseHub';
import type { ChatEvent } from '../../capture/types';
import type { BaseChatCapture } from '../../capture/base';
import type { SpoofCapture } from '../../capture/spoof';

/** Per-connection state tracked by the server. */
export interface Connection {
  id: string;
  capture: BaseChatCapture | SpoofCapture;
  platform: 'youtube' | 'twitch' | 'kick' | 'spoof';
  url: string;
  videoId: string | null;
  messageCount: number;
  chatters: Set<string>;
  startTime: number;
  pollIntervalMs: number;
  /** Set to true after the first poll completes (suppresses sounds for initial backlog). */
  firstPollDone: boolean;
}

/**
 * Shared context passed to every route module.
 *
 * Exposes the minimal surface area routes need from the App class
 * so route files stay decoupled from the server internals.
 */
export interface RouteContext {
  // ── Infrastructure ──
  readonly connections: Map<string, Connection>;
  readonly sse: SSEHub<any>;
  readonly io: SocketIOServer;
  readonly appearance: Record<string, number | string | boolean>;
  readonly sounds: Record<string, number | string>;

  // ── State accessors ──
  getStatus(): Record<string, unknown>;
  isRunning(): boolean;
  setSpoofActive(enabled: boolean): void;
  setSpoofInterval(ms: number, connectionId?: string): void;
  setSpoofPreset(preset: string, connectionId?: string): void;
  isSessionActive(): boolean;
  setSessionActive(active: boolean): void;

  // ── Actions ──
  ensureServer(): Promise<void>;
  apiConnect(url: string): Promise<{ ok: boolean; connectionId?: string; platform?: string; videoId?: string; error?: string }>;
  apiDisconnect(connectionId?: string): Promise<void>;
  shutdownCapture(connectionId?: string): Promise<void>;
  broadcastSystemMessage(text: string, opts?: { showUsername?: boolean; effects?: ChatEvent['effects'] }): void;
}
