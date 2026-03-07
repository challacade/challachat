import type { Server as SocketIOServer } from 'socket.io';
import type { SSEHub } from '../../core/sseHub';
import type { ChatEvent } from '../../capture/types';
import type { BaseChatCapture } from '../../capture/base';

/** Per-connection state tracked by the server. */
export interface Connection {
  id: string;
  capture: BaseChatCapture;
  platform: 'youtube' | 'twitch' | 'kick';
  url: string;
  videoId: string | null;
  messageCount: number;
  chatters: Set<string>;
  startTime: number;
  pollIntervalMs: number;
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
  isDummyChatters(): boolean;
  setDummyChatters(enabled: boolean): void;
  isSessionActive(): boolean;
  setSessionActive(active: boolean): void;

  // ── Actions ──
  ensureServer(): Promise<void>;
  apiConnect(url: string): Promise<{ ok: boolean; connectionId?: string; platform?: string; videoId?: string; error?: string }>;
  apiDisconnect(connectionId?: string): Promise<void>;
  shutdownCapture(connectionId?: string): Promise<void>;
  broadcastSystemMessage(text: string, opts?: { showUsername?: boolean; effects?: ChatEvent['effects'] }): void;
}
