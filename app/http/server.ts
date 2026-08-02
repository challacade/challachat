/* eslint-disable no-console */
import express, { type Request, type Response } from 'express';
import http from 'http';
import path from 'path';
import { EventEmitter } from 'events';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import { DEFAULT_PORT, DEFAULT_POLL_INTERVAL, clampPollInterval } from '../core/config';
import { SSEHub } from '../core/sseHub';
import { TerminalUI } from '../core/terminalUi';
import { censorMessage, loadFilterFromPath, setFilterActive } from '../core/censor';
import { startLogging, stopLogging, logMessage, setLogEnabled, setLogsDir, setLogSpoofEnabled, startSpoofLogging, stopSpoofLogging, logSpoofMessage } from '../core/logger';
import { readSettings, updateSettings, getSavedAppearance, getSavedSounds, getSavedToggles, getConnectionHistory, addConnectionHistory } from '../core/settings';
import { runChatCommands, loadCommands } from '../core/commands';
import YouTubeChatCapture from '../capture/youtube';
import TwitchChatCapture from '../capture/twitch';
import KickChatCapture from '../capture/kick';
import { SpoofCapture } from '../capture/spoof';
import type { ChatEvent, Platform } from '../capture/types';
import { acquireBrowser, closeBrowser } from '../capture/browserPool';
import type { Connection, RouteContext, YouTubeSourceKind } from './routes/context';
import { createCaptureRouter } from './routes/capture';
import { createMusicRouter } from './routes/music';
import { createOverlayRouter } from './routes/overlay';
import { createSettingsRouter } from './routes/settings';

/**
 * Typed events emitted by the App class.
 * In headless (Electron) mode these replace console output;
 * the Electron main process listens and forwards them over IPC.
 */
interface AppEvents {
  'server-ready': (port: number) => void;
  'capture-status': (status: { status: string; connectionId?: string | null; platform?: string | null; videoId?: string | null; messageCount?: number; startedAt?: number; error?: string }) => void;
  'capture-error': (error: string) => void;
  'log': (message: string) => void;
}

// Resolve static directories (overlay + admin)
const __dirnameResolved = __dirname;
const overlayStatic = path.resolve(__dirnameResolved, '..', '..', 'overlay');
const adminStatic = path.resolve(__dirnameResolved, '..', '..', 'admin');
const sharedStatic = path.resolve(__dirnameResolved, '..', '..', 'shared');

const MAX_CONNECTIONS = 5;
const CONNECT_TIMEOUT_MS = 10_000;
const KICK_CONNECT_TIMEOUT_MS = 100_000;
const YOUTUBE_METADATA_TIMEOUT_MS = 2_500;

interface YouTubeOEmbedResponse {
  title?: string;
  author_name?: string;
  author_url?: string;
}

// HTTP server + overlay + SSE wiring
class App extends EventEmitter {
  private app = express();
  private server = http.createServer(this.app);
  private io = new SocketIOServer(this.server, { cors: { origin: '*', methods: ['GET','POST'] } });
  private port = DEFAULT_PORT;
  private pendingPortConfirmation: number | null = null;
  private sse = new SSEHub<any>();
  private connections = new Map<string, Connection>();
  private headless: boolean;
  private tui: TerminalUI | null = null;
  private sessionActive = false;
  private nextConnId = 1;
  private pollIntervalMs = clampPollInterval(readSettings().settings.pollIntervalMs ?? DEFAULT_POLL_INTERVAL);
  /** Sound types already played in the current synchronous poll batch. */
  private soundBatchPlayed = new Set<string>();

  /** True when at least one capture connection is active. */
  private get isRunning(): boolean { return this.connections.size > 0; }

  /** Generate a unique connection ID. */
  private generateConnId(): string { return `conn_${this.nextConnId++}`; }

  private broadcastStatus() {
    try { this.sse.send('status', this.getStatus()); } catch { /* ignore */ }
  }

  // Overlay appearance settings (loaded from settings.json, broadcast via SSE)
  private appearance: Record<string, number | string | boolean> = getSavedAppearance();

  // Sound settings (loaded from settings.json)
  private sounds: Record<string, number | string> = getSavedSounds();
  private serverReadyResolve!: (port: number) => void;
  private serverReadyPromise: Promise<number>;

  constructor(options?: { headless?: boolean }) {
  super();
  this.headless = options?.headless ?? false;
  this.tui = this.headless ? null : new TerminalUI(this.port);
  this.serverReadyPromise = new Promise<number>(resolve => { this.serverReadyResolve = resolve; });
  this.setupServer();
  if (!this.headless) this.setupTerminal();
  this.handleSignals();
  if (this.tui) {
    this.tui.showWelcome();
    this.tui.prompt();
  }
  void this.ensureServerWithRetry();
  }

  // Configure express, static files, and mount route modules
  private setupServer() {
    this.app.use(express.json());

    // If a custom filter path is saved, load from it
    const { settings } = readSettings();
    if (settings.filterPath) {
      loadFilterFromPath(settings.filterPath);
    }

    // Restore saved toggle states
    const toggles = getSavedToggles();
    if (settings.filterPath && toggles.filterActive) {
      setFilterActive(true);
    } else {
      setFilterActive(false);
    }
    if (toggles.loggerEnabled) setLogEnabled(true);
    if (toggles.logSpoofEnabled) setLogSpoofEnabled(true);
    if (settings.logFolderPath) setLogsDir(settings.logFolderPath);

    // Load chat commands (commands.json)
    loadCommands();
    
    // Serve overlay static files directly from the filesystem
    this.app.use(express.static(overlayStatic));
    this.app.use('/shared', express.static(sharedStatic));
    this.app.get('/overlay', (_req: Request, res: Response) => {
      res.sendFile(path.join(overlayStatic, 'index.html'));
    });

    // Build the shared context for route modules
    const ctx: RouteContext = {
      connections: this.connections,
      sse: this.sse,
      io: this.io,
      appearance: this.appearance,
      sounds: this.sounds,
      getStatus: () => this.getStatus(),
      isRunning: () => this.isRunning,
      setSpoofActive: (v, preset) => { if (v) this.startSpoof(preset); else this.stopSpoof(); },
      setSpoofInterval: (ms, id) => this.setSpoofInterval(ms, id),
      setSpoofPreset: (p, id) => this.setSpoofPreset(p, id),
      getPollInterval: () => this.pollIntervalMs,
      setPollInterval: (ms, id) => this.setPollInterval(ms, id),
      getConnectionHistory: () => getConnectionHistory(),
      isSessionActive: () => this.sessionActive,
      setSessionActive: (v) => { this.sessionActive = v; },
      ensureServer: () => this.ensureServer(),
      apiConnect: (url) => this.apiConnect(url),
      apiDisconnect: (id) => this.apiDisconnect(id),
      shutdownCapture: (id) => this.shutdownCapture(id),
    };

    // Mount API route modules
    this.app.use('/api', createCaptureRouter(ctx));
    this.app.use('/api', createMusicRouter(ctx));
    this.app.use('/api', createOverlayRouter(ctx));
    this.app.use('/api', createSettingsRouter(ctx));

    // Socket.IO connection handler (not an HTTP route - stays here)
    this.io.on('connection', (socket: Socket) => {
      const conns = Array.from(this.connections.values());
      socket.emit('capture-status', { status: this.isRunning ? 'active' : 'stopped', connections: conns.map(c => ({ id: c.id, platform: c.platform, videoId: c.videoId, messageCount: c.messageCount })) });
    });

    // Serve admin control panel (static files from admin/ directory)
    this.app.use('/admin', express.static(adminStatic));

  // Do not auto-listen here; let ensureServerWithRetry handle binding and retry prompts
  }

  // Wire terminal input handlers; actual prompt is shown after port bind
  private setupTerminal() {
  if (!this.tui) return;
  const tui = this.tui;
  // Do not prompt until we are successfully listening on a port
    tui.onLine(async (line) => {
      const trimmed = line.trim();
      if (!trimmed) { tui.prompt(); return; }
      if (/^(quit|exit)$/i.test(trimmed)) { await this.shutdown(); return; }
      try {
        await this.ensureServer();
        tui.showConnectingOnce();
        await this.startScraping(trimmed);
      } catch (e: any) {
        console.log(`Error: ${e?.message || String(e)}`);
        tui.prompt();
      }
    });
    tui.onClose(() => { this.shutdown(); });
  }

  private handleSignals() {
    process.on('SIGINT', () => { console.log('\nReceived interrupt signal...'); this.shutdown(); });
    process.on('SIGTERM', () => { console.log('\nReceived termination signal...'); this.shutdown(); });
  }

  // One-shot bind if not already listening
  private async ensureServer() {
    if ((this.server as any)._listening) return;
    await new Promise<void>((resolve) => {
      this.server.listen(this.port, () => { (this.server as any)._listening = true; resolve(); });
    });
  }

  // Bind with retry: on EADDRINUSE, ask user for a different port until success
  private async ensureServerWithRetry() {
    // Try to listen; on EADDRINUSE, auto-increment to the next port until success.
    let attempts = 0;
    while (!(this.server as any)._listening) {
      try {
        await new Promise<void>((resolve, reject) => {
          const onError = (err: any) => {
            this.server.off('listening', onListening);
            reject(err);
          };
          const onListening = () => {
            this.server.off('error', onError);
            (this.server as any)._listening = true;
            if (this.pendingPortConfirmation != null && this.pendingPortConfirmation === this.port) {
              console.log(`Port successfully switched to ${this.port}.`);
              console.log('');
              this.pendingPortConfirmation = null;
            }
            resolve();
          };
          this.server.once('error', onError);
          this.server.once('listening', onListening);
          this.server.listen(this.port);
        });
      } catch (err: any) {
        if (err?.code === 'EADDRINUSE') {
          console.log(`Port ${this.port} is in use. Trying ${this.port + 1}...`);
          this.port = Math.min(65535, this.port + 1);
          this.tui?.setPort(this.port);
          this.pendingPortConfirmation = this.port;
          attempts++;
          if (attempts > 50) throw new Error('Failed to find a free port.');
          continue;
        }
        // Unknown error: show concise message, not stack
        console.log(`Failed to bind to port ${this.port}: ${err?.message || String(err)}. Trying next port...`);
        this.port = Math.min(65535, this.port + 1);
        this.tui?.setPort(this.port);
        this.pendingPortConfirmation = this.port;
        attempts++;
        if (attempts > 50) throw err;
      }
    }
    // Signal that the server is ready (used by Electron main process)
    this.serverReadyResolve(this.port);
    this.emit('server-ready', this.port);
    this.emit('log', `Server listening on port ${this.port}`);
  }

  // Detect platform from URL
  private detectPlatform(url: string): Platform | null {
    const normalized = String(url || '').toLowerCase();
    if (normalized.includes('youtube.com') || normalized.includes('youtu.be') || normalized.includes('studio.youtube.com')) {
      return 'youtube';
    }
    if (normalized.includes('twitch.tv')) {
      return 'twitch';
    }
    if (normalized.includes('kick.com')) {
      return 'kick';
    }
    return null;
  }

  // Extract Twitch channel name from URL
  private extractTwitchChannel(url: string): string | null {
    try {
      const u = new URL(url);
      if (!u.hostname.includes('twitch.tv')) return null;
      // Handle various Twitch URL formats:
      // https://www.twitch.tv/channelname
      // https://www.twitch.tv/channelname/chat
      // https://www.twitch.tv/popout/channelname/chat
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts.length === 0) return null;
      // Skip 'popout' if present
      if (parts[0] === 'popout' && parts.length >= 2) return parts[1].toLowerCase();
      // Standard channel URL
      return parts[0].toLowerCase();
    } catch {
      // Fallback regex
      const match = url.match(/twitch\.tv\/(?:popout\/)?([^/?&#]+)/i);
      return match ? match[1].toLowerCase() : null;
    }
  }

  // Per-platform config used by the unified startCapture method
  private platformConfig: Record<Platform, {
    extractId: (url: string) => string | null;
    CaptureClass: new (id: string, opts: any) => YouTubeChatCapture | TwitchChatCapture | KickChatCapture;
    buildDisplayUrl: (id: string, originalUrl: string) => string;
    logPrefix: string;
    errorMessage: string;
  }> = {
    youtube: {
      extractId: (url) => this.extractVideoId(url),
      CaptureClass: YouTubeChatCapture,
      buildDisplayUrl: (id, url) => /^https?:\/\/studio\.youtube\.com\//i.test(url) ? this.toPublicLiveUrl(id) : url,
      logPrefix: 'yt',
      errorMessage: 'Invalid YouTube URL. Please provide a valid YouTube livestream URL.',
    },
    twitch: {
      extractId: (url) => this.extractTwitchChannel(url),
      CaptureClass: TwitchChatCapture,
      buildDisplayUrl: (id) => `https://www.twitch.tv/${id}`,
      logPrefix: 'tw',
      errorMessage: 'Invalid Twitch URL. Please provide a valid Twitch channel URL.',
    },
    kick: {
      extractId: (url) => this.extractKickChannel(url),
      CaptureClass: KickChatCapture,
      buildDisplayUrl: (id) => `https://kick.com/${id}`,
      logPrefix: 'kk',
      errorMessage: 'Invalid Kick URL. Please provide a valid Kick channel URL.',
    },
  };

  // Start capture for the provided livestream URL
  private async startScraping(url: string): Promise<string> {
    if (this.connections.size >= MAX_CONNECTIONS) {
      throw new Error(`Maximum of ${MAX_CONNECTIONS} concurrent connections reached.`);
    }

    // Prevent duplicate URLs
    for (const conn of this.connections.values()) {
      if (conn.url === url) throw new Error('Already connected to this URL.');
    }

    const platform = this.detectPlatform(url);
    if (!platform) {
      throw new Error('Unsupported URL. Please provide a YouTube, Twitch, or Kick livestream URL.');
    }

    return this.startCapture(url, platform);
  }

  // Unified capture start - all platform differences are handled by platformConfig
  private async startCapture(url: string, platform: Platform): Promise<string> {
    const config = this.platformConfig[platform];
    const connId = this.generateConnId();
    const identifier = platform === 'youtube' ? await this.extractYouTubeVideoId(url) : config.extractId(url);
    if (!identifier) throw new Error(config.errorMessage);
    const displayUrl = config.buildDisplayUrl(identifier, url);
    const youtubeDetails = platform === 'youtube' ? this.getYouTubeInitialDetails(identifier, url) : {};

    const capture = new config.CaptureClass(identifier, {
      pollInterval: this.pollIntervalMs,
      quiet: true,
      maxRetries: 1,
      onMessage: (message: ChatEvent) => this.onCaptureMessage(connId, message),
      onDelete: (id: string) => this.onCaptureDelete(id),
      onError: (err: Error) => {
        console.log(`[ERROR] ${err.message}`);
        if (this.connections.get(connId)?.status === 'active') this.emit('capture-error', err.message);
      },
      onStatusChange: (status: any) => {
        const payload = { ...status, connectionId: connId };
        this.io.emit('capture-status', payload);
        this.emit('capture-status', payload);
        if (status?.status === 'active') this.tui?.render();
      }
    });
    this.connections.set(connId, {
      id: connId, capture, platform, url: displayUrl, ...youtubeDetails,
      videoId: identifier, status: 'connecting', statusText: 'Connecting', messageCount: 0, chatters: new Set(), startTime: Date.now(),
      pollIntervalMs: this.pollIntervalMs,
      firstPollDone: false,
    });
    this.broadcastStatus();
    if (platform === 'youtube') void this.enrichYouTubeConnectionDetails(connId, identifier, url);
    void this.finishCaptureStartup(connId, capture, config.logPrefix, displayUrl, platform, identifier);
    return connId;
  }

  private async finishCaptureStartup(connId: string, capture: YouTubeChatCapture | TwitchChatCapture | KickChatCapture, logPrefix: string, displayUrl: string, platform: Platform, identifier: string): Promise<void> {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const connectTimeoutMs = platform === 'kick' ? KICK_CONNECT_TIMEOUT_MS : CONNECT_TIMEOUT_MS;
    try {
      // Browser launch is one-time initialization, not part of a channel
      // connection. Warm the profile that this capture will use before
      // applying the platform's normal connection deadline.
      await acquireBrowser(platform === 'kick' ? 'compatible' : 'default');

      await Promise.race([
        capture.start(),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => reject(new Error(`Connection to ${displayUrl} timed out after ${Math.round(connectTimeoutMs / 1000)} seconds while starting ${platform} capture.`)), connectTimeoutMs);
        }),
      ]);

      const conn = this.connections.get(connId);
      if (!conn || conn.status !== 'connecting') return;
      conn.status = 'active';
      conn.statusText = 'Active';
      conn.connectedAt = Date.now();
      conn.startTime = conn.connectedAt;
      conn.error = undefined;

      addConnectionHistory({
        key: `stream:${displayUrl}`,
        type: 'stream',
        label: displayUrl,
        url: displayUrl,
        platform,
      });
      this.tui?.setUrl(displayUrl);
      startLogging(logPrefix);
      this.tui?.render();

      const captureStatus = { status: 'active' as const, platform, videoId: identifier, startedAt: conn.connectedAt, connectionId: connId };
      this.io.emit('capture-status', captureStatus);
      this.emit('capture-status', captureStatus);
      this.broadcastStatus();
    } catch (e: any) {
      const message = e?.message || String(e);
      console.log(`[ERROR] ${message}`);
      const conn = this.connections.get(connId);
      if (conn) {
        conn.status = 'failed';
        conn.statusText = 'Failed';
        conn.error = message;
        conn.connectedAt = undefined;
      }
      try { await (capture as any).cleanup?.(); } catch { /* ignore cleanup errors */ }
      const captureStatus = { status: 'failed' as const, platform, videoId: identifier, connectionId: connId, error: message };
      this.io.emit('capture-status', captureStatus);
      this.emit('capture-status', captureStatus);
      this.broadcastStatus();
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  // Extract Kick channel name from URL
  private extractKickChannel(url: string): string | null {
    try {
      const u = new URL(url);
      if (!u.hostname.includes('kick.com')) return null;
      // Handle various Kick URL formats:
      // https://kick.com/channelname
      // https://kick.com/popout/channelname/chat
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts.length === 0) return null;
      // Skip 'popout' if present
      if (parts[0] === 'popout' && parts.length >= 2) return parts[1].toLowerCase();
      // Standard channel URL
      return parts[0].toLowerCase();
    } catch {
      // Fallback regex
      const match = url.match(/kick\.com\/(?:popout\/)?([^/?&#]+)/i);
      return match ? match[1].toLowerCase() : null;
    }
  }

  // Relay messages to SSE clients and overlay
  private onCaptureMessage(connId: string, message: ChatEvent) {
    const conn = this.connections.get(connId);
    if (conn) {
      // Mark first poll as done after initial batch (suppress sounds for backlog)
      if (!conn.firstPollDone) {
        conn.messageCount++;
        if (message.author?.name) conn.chatters.add(message.author.name);
        // Process message normally but skip sound
        try { runChatCommands(message); } catch (err) { console.warn('[Commands] Error running chat command:', err); }
        const filtered = censorMessage(message);
        if (conn.platform === 'spoof') { logSpoofMessage(filtered); } else { logMessage(filtered); }
        this.io.emit('chat-message', filtered);
        this.sse.send('chat', { events: [this.normalizeForOverlay(filtered)] });
        // Schedule first-poll completion after current tick (all messages from the same poll arrive synchronously)
        queueMicrotask(() => { conn.firstPollDone = true; });
        return;
      }
      conn.messageCount++;
      if (message.author?.name) conn.chatters.add(message.author.name);
    }

    // Run chat commands before censoring/broadcasting.
    try {
      runChatCommands(message);
    } catch (err) {
      console.warn('[Commands] Error running chat command:', err);
    }

    // Apply profanity filter before broadcasting
    const filtered = censorMessage(message);
    // Log message to file (if logging is enabled)
    const isSpoof = this.connections.get(connId)?.platform === 'spoof';
    if (isSpoof) { logSpoofMessage(filtered); } else { logMessage(filtered); }
  // No terminal preview or re-rendering of the header during message flow.
    this.io.emit('chat-message', filtered);
    this.sse.send('chat', { events: [this.normalizeForOverlay(filtered)] });

    // Determine sound type and broadcast to admin UI for playback
    const kind = filtered.kind || 'text';
    let soundType: string | null = null;
    if (kind === 'sub' || kind === 'sub-gift' || kind === 'member' || kind === 'member-renewal' || kind === 'member-gift' || kind === 'streak' || kind === 'member-milestone') {
      soundType = 'member';
    } else if (kind === 'cheer' || kind === 'donation') {
      soundType = 'donation';
    } else {
      soundType = 'message';
    }
    if (soundType && !this.soundBatchPlayed.has(soundType)) {
      this.soundBatchPlayed.add(soundType);
      // Reset after the current synchronous batch finishes
      if (this.soundBatchPlayed.size === 1) {
        queueMicrotask(() => this.soundBatchPlayed.clear());
      }
      this.sse.send('play-sound', { type: soundType, ts: Date.now() });
    }
  }

  // Relay delete events (by id) so overlays can remove them immediately
  private onCaptureDelete(id: string) {
    if (!id) return;
    try { this.io.emit('chat-delete', { id }); } catch { /* ignore */ }
    try { this.sse.send('chat', { events: [{ type: 'delete', id }] as any }); } catch { /* ignore */ }
  }

  // Normalize event shape for the overlay client
  private normalizeForOverlay(message: ChatEvent): ChatEvent {
    const flags = message.author?.flags || { owner: false, mod: false, verified: false, member: false };
    return {
      id: message.id || `yt_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
      author: {
        name: message.author?.name || 'User',
        avatar: message.author?.avatar || '',
        flags,
        badges: message.author?.badges,
        nameColor: message.author?.nameColor,
        badgePosition: message.author?.badgePosition
      },
      text: message.text || '',
      segments: message.segments,
      kind: message.kind || 'text',
      ts: message.ts || Date.now(),
      showUsername: message.showUsername,
      amountDisplay: message.amountDisplay,
      color: message.color,
      systemMessage: message.systemMessage,
      replyTo: message.replyTo
    };
  }

  // Support multiple YouTube URL shapes for extracting the video id
  private extractVideoId(url: string): string | null {
    try {
      const u = new URL(url);
      // Creator/admin URLs (YouTube Studio)
      if (u.hostname === 'studio.youtube.com') {
        if (u.pathname === '/live_chat') return u.searchParams.get('v');
        // e.g. https://studio.youtube.com/video/<videoId>/livestreaming
        const parts = u.pathname.split('/').filter(Boolean);
        if (parts.length >= 2 && parts[0] === 'video') return parts[1];
      }

      if (u.pathname === '/watch') return u.searchParams.get('v');
      if (u.pathname.startsWith('/live/')) return u.pathname.replace('/live/', '');
      if (u.pathname === '/live_chat') return u.searchParams.get('v');
      if (u.pathname === '/live_dashboard') return u.searchParams.get('v');
      if (u.hostname === 'youtu.be') return u.pathname.slice(1);
    } catch {
      const regex = /(?:studio\.youtube\.com\/video\/|studio\.youtube\.com\/live_chat\?[^\n]*v=|youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/live\/|youtube\.com\/live_chat\?v=|youtube\.com\/live_dashboard\?v=)([^&\n?#/]+)/;
      const match = url.match(regex);
      return match ? match[1] : null;
    }
    return null;
  }

  private async extractYouTubeVideoId(url: string): Promise<string | null> {
    const directVideoId = this.extractVideoId(url);
    if (directVideoId) return directVideoId;
    if (!this.isYouTubeHandleLiveUrl(url)) return null;

    try {
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          // YouTube can return non-redirect responses for non-browser user agents.
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
          'accept-language': 'en-US,en;q=0.9',
        },
      });
      if (!response.ok) return null;

      const resolvedVideoId = this.extractVideoId(response.url || '');
      if (resolvedVideoId) return resolvedVideoId;

      return this.extractVideoIdFromYouTubeHtml(await response.text());
    } catch {
      return null;
    }
  }

  private extractVideoIdFromYouTubeHtml(html: string): string | null {
    if (!html) return null;

    const canonicalWatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})/i);
    if (canonicalWatch?.[1]) return canonicalWatch[1];

    const shortLink = html.match(/<link[^>]+rel=["']shortlinkUrl["'][^>]+href=["']https?:\/\/youtu\.be\/([A-Za-z0-9_-]{11})/i);
    if (shortLink?.[1]) return shortLink[1];

    const embedded = html.match(/"videoId":"([A-Za-z0-9_-]{11})"/);
    return embedded?.[1] ?? null;
  }

  private isYouTubeHandleLiveUrl(url: string): boolean {
    try {
      const u = new URL(url);
      if (u.hostname !== 'youtube.com' && !u.hostname.endsWith('.youtube.com')) return false;
      return /^\/@[^/]+\/live\/?$/i.test(u.pathname);
    } catch {
      return /(?:^|\.)youtube\.com\/@[^/?#]+\/live\/?(?:[?#].*)?$/i.test(url);
    }
  }

  private toPublicLiveUrl(videoId: string): string {
    return `https://www.youtube.com/live/${videoId}`;
  }

  private getYouTubeInitialDetails(videoId: string, originalUrl: string): Partial<Connection> {
    const channelUrl = this.extractYouTubeChannelLiveUrl(originalUrl);
    return {
      originalUrl,
      resolvedUrl: this.toPublicLiveUrl(videoId),
      channelUrl,
      displayName: channelUrl ? this.extractYouTubeChannelLabel(channelUrl) : undefined,
      sourceKind: this.getYouTubeSourceKind(originalUrl),
    };
  }

  private async enrichYouTubeConnectionDetails(connId: string, videoId: string, originalUrl: string): Promise<void> {
    const metadata = await this.fetchYouTubeOEmbed(videoId);
    if (!metadata) return;

    const conn = this.connections.get(connId);
    if (!conn || conn.platform !== 'youtube') return;

    const fallback = this.getYouTubeInitialDetails(videoId, originalUrl);
    conn.displayName = metadata.author_name?.trim() || fallback.displayName;
    conn.streamTitle = metadata.title?.trim() || conn.streamTitle;
    conn.channelUrl = metadata.author_url?.trim() || fallback.channelUrl;
    conn.resolvedUrl = fallback.resolvedUrl;
    conn.originalUrl = fallback.originalUrl;
    conn.sourceKind = fallback.sourceKind;
    this.broadcastStatus();
  }

  private async fetchYouTubeOEmbed(videoId: string): Promise<YouTubeOEmbedResponse | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), YOUTUBE_METADATA_TIMEOUT_MS);
    try {
      const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(this.toPublicLiveUrl(videoId))}&format=json`, {
        signal: controller.signal,
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
          'accept-language': 'en-US,en;q=0.9',
        },
      });
      if (!response.ok) return null;
      return await response.json() as YouTubeOEmbedResponse;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private getYouTubeSourceKind(url: string): YouTubeSourceKind {
    try {
      const u = new URL(url);
      if (u.hostname === 'studio.youtube.com') return 'studio';
      if (u.hostname === 'youtu.be') return 'shortlink';
      if (this.isYouTubeHandleLiveUrl(url)) return 'channel-live';
    } catch {
      if (this.isYouTubeHandleLiveUrl(url)) return 'channel-live';
      if (/studio\.youtube\.com/i.test(url)) return 'studio';
      if (/youtu\.be\//i.test(url)) return 'shortlink';
    }
    return 'direct-video';
  }

  private extractYouTubeChannelLiveUrl(url: string): string | undefined {
    try {
      const u = new URL(url);
      if (!this.isYouTubeHandleLiveUrl(url)) return undefined;
      const handle = u.pathname.split('/').filter(Boolean)[0];
      return handle ? `https://www.youtube.com/${handle}` : undefined;
    } catch {
      const match = url.match(/(?:^|\.)youtube\.com\/(%40[^/?#]+|@[^/?#]+)\/live\/?/i);
      return match?.[1] ? `https://www.youtube.com/${decodeURIComponent(match[1])}` : undefined;
    }
  }

  private extractYouTubeChannelLabel(channelUrl: string): string | undefined {
    try {
      const u = new URL(channelUrl);
      const firstPart = u.pathname.split('/').filter(Boolean)[0];
      return firstPart ? decodeURIComponent(firstPart) : undefined;
    } catch {
      const match = channelUrl.match(/youtube\.com\/([^/?#]+)/i);
      return match?.[1] ? decodeURIComponent(match[1]) : undefined;
    }
  }

  // Gracefully stop one (or all) capture connections
  private async shutdownCapture(connectionId?: string) {
    if (connectionId) {
      const conn = this.connections.get(connectionId);
      if (!conn) return;
      try { await conn.capture?.stop(); } catch (e: any) { console.log(`Error stopping capture ${connectionId}: ${e?.message || e}`); }
      const duration = Math.round((Date.now() - (conn.startTime || Date.now())) / 1000);
      console.log(`Connection ${connectionId} stopped (${conn.platform} - ${duration}s, ${conn.messageCount} msgs)`);
      this.connections.delete(connectionId);
    } else {
      // Stop all
      for (const [id, conn] of this.connections) {
        try { await conn.capture?.stop(); } catch (e: any) { console.log(`Error stopping capture ${id}: ${e?.message || e}`); }
      }
      this.connections.clear();
    }
    if (this.connections.size === 0) {
      stopLogging();
    }
    const stoppedStatus = { status: this.isRunning ? 'active' as const : 'stopped' as const, connectionId: connectionId ?? null };
    this.io.emit('capture-status', stoppedStatus);
    this.emit('capture-status', stoppedStatus);
    this.broadcastStatus();
  }

  // --- Public API (used by Electron main process and REST endpoints) ---

  /** Check if a spoof connection is currently active. */
  private isSpoofActive(): boolean {
    for (const conn of this.connections.values()) {
      if (conn.platform === 'spoof') return true;
    }
    return false;
  }

  /** Start a spoof connection (dummy chatters). */
  private startSpoof(preset?: string) {
    const presetLabel = preset ? preset.charAt(0).toUpperCase() + preset.slice(1) : 'Welcome';
    const connId = this.generateConnId();
    const spoof = new SpoofCapture({
      onMessage: (msg: ChatEvent) => this.onCaptureMessage(connId, msg),
    });
    if (preset) spoof.setPreset(preset);
    this.connections.set(connId, {
      id: connId, capture: spoof, platform: 'spoof', url: `Spoof Chat - ${presetLabel}`,
      videoId: null, status: 'active', statusText: 'Active', messageCount: 0, chatters: new Set(), startTime: Date.now(), connectedAt: Date.now(),
      pollIntervalMs: 0, firstPollDone: true, displayName: `Spoof Chat - ${presetLabel}`, spoofPreset: preset || 'welcome',
    });
    addConnectionHistory({
      key: `spoof:${preset || 'welcome'}`,
      type: 'spoof',
      label: `Spoof Chat - ${presetLabel}`,
      preset: preset || 'welcome',
    });
    startSpoofLogging();
    void spoof.start();
    this.broadcastStatus();
  }

  /** Stop and remove the spoof connection. */
  private async stopSpoof() {
    stopSpoofLogging();
    for (const [id, conn] of this.connections) {
      if (conn.platform === 'spoof') {
        try { await conn.capture.stop(); } catch { /* ignore */ }
        this.connections.delete(id);
      }
    }
    this.broadcastStatus();
  }

  /** Update the interval on a specific (or all) spoof connection(s). */
  private setSpoofInterval(ms: number, connectionId?: string) {
    for (const conn of this.connections.values()) {
      if (conn.platform === 'spoof' && (!connectionId || conn.id === connectionId) && 'setIntervalMs' in conn.capture) {
        (conn.capture as SpoofCapture).setIntervalMs(ms);
      }
    }
  }

  /** Update the capture polling interval globally, or for one connection if requested. */
  private setPollInterval(ms: number, connectionId?: string): number {
    if (!connectionId) {
      this.pollIntervalMs = ms;
      updateSettings({ pollIntervalMs: ms });
    }
    for (const conn of this.connections.values()) {
      if (!connectionId || conn.id === connectionId) {
        conn.capture.setPollInterval(ms);
        conn.pollIntervalMs = ms;
      }
    }
    return connectionId ? ms : this.pollIntervalMs;
  }

  /** Update the preset on a specific (or all) spoof connection(s). */
  private setSpoofPreset(preset: string, connectionId?: string) {
    for (const conn of this.connections.values()) {
      if (conn.platform === 'spoof' && (!connectionId || conn.id === connectionId) && 'setPreset' in conn.capture) {
        (conn.capture as SpoofCapture).setPreset(preset);
      }
    }
  }

  /** Wait for the HTTP server to be listening. Resolves with the bound port. */
  waitForReady(): Promise<number> {
    return this.serverReadyPromise;
  }

  /** Return the port the server is listening on. */
  getPort(): number {
    return this.port;
  }

  /** Return the current application status (mirrors /api/status). */
  getStatus() {
    const connections = Array.from(this.connections.values())
      .map(c => ({
        id: c.id,
        platform: c.platform,
        url: c.url,
        displayName: c.displayName,
        originalUrl: c.originalUrl,
        resolvedUrl: c.resolvedUrl,
        channelUrl: c.channelUrl,
        streamTitle: c.streamTitle,
        sourceKind: c.sourceKind,
        videoId: c.videoId,
        status: c.status,
        statusText: c.statusText,
        error: c.error,
        messageCount: c.messageCount,
        chatters: c.chatters.size,
        uptime: c.status === 'active' && c.connectedAt ? Date.now() - c.connectedAt : 0,
        pollIntervalMs: c.pollIntervalMs,
        ...(c.platform === 'spoof' && 'getIntervalMs' in c.capture
          ? { spoofIntervalMs: (c.capture as SpoofCapture).getIntervalMs(), spoofPreset: c.spoofPreset }
          : {}),
      }));
    return {
      isRunning: this.isRunning,
      sessionActive: this.sessionActive,
      connections,
      overlayUrl: `http://localhost:${this.port}/`,
    };
  }

  /** Connect to a livestream URL. Returns a result object with connectionId. */
  async apiConnect(url: string): Promise<{ ok: boolean; connectionId?: string; platform?: string; videoId?: string; error?: string }> {
    try {
      await this.ensureServer();
      this.sessionActive = true;
      const connId = await this.startScraping(url);
      const conn = this.connections.get(connId);
      return { ok: true, connectionId: connId, platform: conn?.platform ?? undefined, videoId: conn?.videoId ?? undefined };
    } catch (e: any) {
      return { ok: false, error: e?.message || String(e) };
    }
  }

  /** Disconnect a specific capture connection, or all if no id given. */
  async apiDisconnect(connectionId?: string): Promise<void> {
    await this.shutdownCapture(connectionId);
  }

  async shutdown(): Promise<void> {
    await this.shutdownCapture();
    this.sessionActive = false;
    await closeBrowser();
    // Close all SSE and Socket.IO connections so server.close() can drain
    this.sse.close();
    this.io.close();
    return new Promise<void>((resolve) => {
      // Force-exit if server.close() doesn't complete within 5 seconds
      const forceTimer = setTimeout(() => {
        console.log('Server close timed out, forcing exit.');
        if (!this.headless) process.exit(0);
        resolve();
      }, 5000);
      forceTimer.unref();
      this.server.close(() => {
        clearTimeout(forceTimer);
        console.log('Server closed. Goodbye!');
        if (!this.headless) process.exit(0);
        resolve();
      });
    });
  }
}

export { App };

// Auto-start in standalone terminal mode (not when imported by Electron)
if (!process.env.CHALLACHAT_ELECTRON) {
  new App();
}
