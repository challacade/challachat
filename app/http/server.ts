/* eslint-disable no-console */
import express, { type Request, type Response } from 'express';
import http from 'http';
import net from 'net';
import path from 'path';
import { EventEmitter } from 'events';
import { DEFAULT_PORT, DEFAULT_POLL_INTERVAL, clampPollInterval } from '../core/config';
import { SSEHub } from '../core/sseHub';
import { TerminalUI } from '../core/terminalUi';
import { censorMessage, loadFilterFromPath, setFilterActive } from '../core/censor';
import { startLogging, stopLogging, logMessage, setLogEnabled, setLogsDir, setLogSpoofEnabled } from '../core/logger';
import { readSettings, updateSettings, getSavedAppearance, getSavedSounds, getSavedToggles, getConnectionHistory, addConnectionHistory } from '../core/settings';
import { runChatCommands, loadCommands } from '../core/commands';
import YouTubeChatCapture from '../capture/youtube';
import TwitchChatCapture from '../capture/twitch';
import KickChatCapture from '../capture/kick';
import { SpoofCapture } from '../capture/spoof';
import type { ChatEvent, Platform } from '../capture/types';
import { acquireBrowser, closeBrowser } from '../capture/browserPool';
import {
  detectPlatform, extractKickChannel, extractTwitchChannel, extractVideoId, extractVideoIdFromYouTubeHtml,
  extractYouTubeChannelLabel, extractYouTubeChannelLiveUrl, getYouTubeSourceKind, isYouTubeHandleLiveUrl, toPublicLiveUrl,
} from '../capture/urls';
import type { Connection, RouteContext } from './routes/context';
import { createCaptureRouter } from './routes/capture';
import { createMusicRouter } from './routes/music';
import { createOverlayRouter } from './routes/overlay';
import { createSettingsRouter } from './routes/settings';

// Resolve static directories (overlay + admin)
const __dirnameResolved = __dirname;
const overlayStatic = path.resolve(__dirnameResolved, '..', '..', 'overlay');
const adminStatic = path.resolve(__dirnameResolved, '..', '..', 'admin');
const sharedStatic = path.resolve(__dirnameResolved, '..', '..', 'shared');

const MAX_CONNECTIONS = 10;
const CONNECT_TIMEOUT_MS = 10_000;
const KICK_CONNECT_TIMEOUT_MS = 100_000;
const MAX_CONNECT_ATTEMPTS = 2;
const YOUTUBE_METADATA_TIMEOUT_MS = 2_500;
const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);
const PORT_PROBE_TIMEOUT_MS = 250;

function listenOn(server: http.Server, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (err: Error) => { server.off('listening', onListening); reject(err); };
    const onListening = () => { server.off('error', onError); resolve(); };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise(resolve => server.close(() => resolve()));
}

// Windows lets us bind loopback even when another app holds the port on all interfaces, so ask the port directly.
function isPortAnswering(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const finish = (answering: boolean) => { clearTimeout(timer); socket.destroy(); resolve(answering); };
    const timer = setTimeout(() => finish(false), PORT_PROBE_TIMEOUT_MS);
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

function isLoopbackHostHeader(host: string | undefined): boolean {
  if (!host) return false;
  return LOOPBACK_HOSTNAMES.has(host.toLowerCase().replace(/:\d+$/, ''));
}

function isLoopbackOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    return u.protocol === 'http:' && LOOPBACK_HOSTNAMES.has(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

interface YouTubeOEmbedResponse {
  title?: string;
  author_name?: string;
  author_url?: string;
}

// HTTP server + overlay + SSE wiring
class App extends EventEmitter {
  private app = express();
  private server = http.createServer(this.app);
  // Second listener so "localhost" reaches us whether it resolves to IPv4 or IPv6.
  private serverV6 = http.createServer(this.app);
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
    // Host check blocks DNS rebinding; Origin check blocks other websites posting to the API.
    this.app.use((req: Request, res: Response, next) => {
      const origin = req.headers.origin;
      if (isLoopbackHostHeader(req.headers.host) && (!origin || isLoopbackOrigin(origin))) {
        next();
        return;
      }
      res.status(403).json({ error: 'Forbidden' });
    });
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

  // Binding is owned by ensureServerWithRetry (started in the constructor); just wait for it.
  private async ensureServer() {
    await this.serverReadyPromise;
  }

  // Listen on IPv4 + IPv6 loopback only, so nothing on the network can reach the server.
  private async bindLoopback(port: number): Promise<void> {
    const answering = await Promise.all([isPortAnswering('127.0.0.1', port), isPortAnswering('::1', port)]);
    if (answering.some(Boolean)) throw Object.assign(new Error(`Port ${port} is in use.`), { code: 'EADDRINUSE' });
    await listenOn(this.server, port, '127.0.0.1');
    try {
      await listenOn(this.serverV6, port, '::1');
    } catch (err: any) {
      // Any other error means IPv6 loopback is unavailable; IPv4 alone still serves localhost.
      if (err?.code !== 'EADDRINUSE') return;
      await closeServer(this.server);
      throw err;
    }
  }

  // Bind, auto-incrementing the port while it is in use.
  private async ensureServerWithRetry() {
    for (let attempts = 0; ; attempts++) {
      try {
        await this.bindLoopback(this.port);
        break;
      } catch (err: any) {
        if (attempts >= 50) throw new Error('Failed to find a free port.');
        const reason = err?.code === 'EADDRINUSE' ? 'is in use' : `failed to bind (${err?.message || String(err)})`;
        console.log(`Port ${this.port} ${reason}. Trying ${this.port + 1}...`);
        this.port = Math.min(65535, this.port + 1);
        this.tui?.setPort(this.port);
        this.pendingPortConfirmation = this.port;
      }
    }
    if (this.pendingPortConfirmation === this.port) {
      console.log(`Port successfully switched to ${this.port}.`);
      console.log('');
      this.pendingPortConfirmation = null;
    }
    // Signal that the server is ready (used by Electron main process)
    this.serverReadyResolve(this.port);
    this.emit('server-ready', this.port);
    this.emit('log', `Server listening on port ${this.port}`);
  }

  // Per-platform config used by the unified startCapture method
  private platformConfig: Record<Platform, {
    extractId: (url: string) => string | null;
    CaptureClass: new (id: string, opts: any) => YouTubeChatCapture | TwitchChatCapture | KickChatCapture;
    buildDisplayUrl: (id: string, originalUrl: string) => string;
    errorMessage: string;
    connectTimeoutMs: number;
  }> = {
    youtube: {
      extractId: (url) => extractVideoId(url),
      CaptureClass: YouTubeChatCapture,
      buildDisplayUrl: (id, url) => /^https?:\/\/studio\.youtube\.com\//i.test(url) ? toPublicLiveUrl(id) : url,
      errorMessage: 'Invalid YouTube URL. Please provide a valid YouTube livestream URL.',
      connectTimeoutMs: CONNECT_TIMEOUT_MS,
    },
    twitch: {
      extractId: (url) => extractTwitchChannel(url),
      CaptureClass: TwitchChatCapture,
      buildDisplayUrl: (id) => `https://www.twitch.tv/${id}`,
      errorMessage: 'Invalid Twitch URL. Please provide a valid Twitch channel URL.',
      connectTimeoutMs: CONNECT_TIMEOUT_MS,
    },
    kick: {
      extractId: (url) => extractKickChannel(url),
      CaptureClass: KickChatCapture,
      buildDisplayUrl: (id) => `https://kick.com/${id}`,
      errorMessage: 'Invalid Kick URL. Please provide a valid Kick channel URL.',
      connectTimeoutMs: KICK_CONNECT_TIMEOUT_MS,
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

    const platform = detectPlatform(url);
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
    void this.finishCaptureStartup(connId, capture, displayUrl, platform, identifier, config.connectTimeoutMs);
    return connId;
  }

  private async finishCaptureStartup(connId: string, capture: YouTubeChatCapture | TwitchChatCapture | KickChatCapture, displayUrl: string, platform: Platform, identifier: string, connectTimeoutMs: number): Promise<void> {
    try {
      // Browser launch is one-time initialization, not part of a channel
      // connection. Warm the profile that this capture will use before
      // applying the platform's normal connection deadline.
      await acquireBrowser(platform === 'kick' ? 'compatible' : 'default');

      for (let attempt = 1; attempt <= MAX_CONNECT_ATTEMPTS; attempt++) {
        let timedOut = false;
        let timeout: ReturnType<typeof setTimeout> | null = null;
        const startup = capture.start();

        try {
          await Promise.race([
            startup,
            new Promise<never>((_resolve, reject) => {
              timeout = setTimeout(() => {
                timedOut = true;
                reject(new Error(`Connection to ${displayUrl} timed out after ${Math.round(connectTimeoutMs / 1000)} seconds.`));
              }, connectTimeoutMs);
            }),
          ]);
          if (timeout) clearTimeout(timeout);
          break;
        } catch (error) {
          if (timeout) clearTimeout(timeout);
          if (!timedOut) throw error;

          const conn = this.connections.get(connId);
          const willRetry = attempt < MAX_CONNECT_ATTEMPTS;
          if (conn && willRetry) {
            conn.status = 'connecting';
            conn.statusText = 'Retrying';
            conn.error = undefined;
            const retryStatus = { status: 'retrying' as const, platform, videoId: identifier, connectionId: connId };
            this.emit('capture-status', retryStatus);
            this.broadcastStatus();
          }

          await capture.cancelStartup();
          await startup.catch(() => {});

          if (!this.connections.has(connId)) return;
          if (!willRetry) throw error;
        }
      }

      const conn = this.connections.get(connId);
      if (!conn || conn.status !== 'connecting') {
        await capture.stop();
        return;
      }
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
      startLogging();
      this.tui?.render();

      const captureStatus = { status: 'active' as const, platform, videoId: identifier, startedAt: conn.connectedAt, connectionId: connId };
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
      try { await capture.cancelStartup(); } catch { /* ignore cleanup errors */ }
      const captureStatus = { status: 'failed' as const, platform, videoId: identifier, connectionId: connId, error: message };
      this.emit('capture-status', captureStatus);
      this.broadcastStatus();
    }
  }

  // Relay messages to SSE clients and overlay
  private onCaptureMessage(connId: string, message: ChatEvent) {
    const conn = this.connections.get(connId);
    // The first poll delivers the visible backlog synchronously; it is shown but plays no sound.
    const isBacklog = !!conn && !conn.firstPollDone;
    if (conn) {
      conn.messageCount++;
      if (message.author?.name) conn.chatters.add(message.author.name);
      if (isBacklog) queueMicrotask(() => { conn.firstPollDone = true; });
    }

    // Run chat commands before censoring/broadcasting.
    try {
      runChatCommands(message);
    } catch (err) {
      console.warn('[Commands] Error running chat command:', err);
    }

    const filtered = censorMessage(message);
    if (conn) logMessage(filtered, conn.platform);
    this.sse.send('chat', { events: [this.normalizeForOverlay(filtered)] });
    if (isBacklog) return;

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

  private async extractYouTubeVideoId(url: string): Promise<string | null> {
    const directVideoId = extractVideoId(url);
    if (directVideoId) return directVideoId;
    if (!isYouTubeHandleLiveUrl(url)) return null;

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

      const resolvedVideoId = extractVideoId(response.url || '');
      if (resolvedVideoId) return resolvedVideoId;

      return extractVideoIdFromYouTubeHtml(await response.text());
    } catch {
      return null;
    }
  }

  private getYouTubeInitialDetails(videoId: string, originalUrl: string): Partial<Connection> {
    const channelUrl = extractYouTubeChannelLiveUrl(originalUrl);
    return {
      originalUrl,
      resolvedUrl: toPublicLiveUrl(videoId),
      channelUrl,
      displayName: channelUrl ? extractYouTubeChannelLabel(channelUrl) : undefined,
      sourceKind: getYouTubeSourceKind(originalUrl),
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
      const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(toPublicLiveUrl(videoId))}&format=json`, {
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
    this.emit('capture-status', stoppedStatus);
    this.broadcastStatus();
  }

  // --- Public API (used by Electron main process and REST endpoints) ---

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
    startLogging();
    void spoof.start();
    this.broadcastStatus();
  }

  /** Stop and remove the spoof connection. */
  private async stopSpoof() {
    for (const [id, conn] of this.connections) {
      if (conn.platform === 'spoof') {
        try { await conn.capture.stop(); } catch { /* ignore */ }
        this.connections.delete(id);
      }
    }
    if (this.connections.size === 0) stopLogging();
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
    // Close all SSE connections so server.close() can drain
    this.sse.close();
    return new Promise<void>((resolve) => {
      // Force-exit if server.close() doesn't complete within 5 seconds
      const forceTimer = setTimeout(() => {
        console.log('Server close timed out, forcing exit.');
        if (!this.headless) process.exit(0);
        resolve();
      }, 5000);
      forceTimer.unref();
      void Promise.all([closeServer(this.server), closeServer(this.serverV6)]).then(() => {
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
