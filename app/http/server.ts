/* eslint-disable no-console */
import express, { type Request, type Response } from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { EventEmitter } from 'events';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import { DEFAULT_PORT, DEFAULT_POLL_INTERVAL, clampPollInterval } from '../core/config';
import { SSEHub } from '../core/sseHub';
import { TerminalUI } from '../core/terminalUi';
import { censorMessage, getFilterStatus, reloadFilter, setFilterActive } from '../core/censor';
import { startLogging, stopLogging, logMessage, setLogEnabled, getLoggerStatus } from '../core/logger';
import { getDisableSongIdNotes, getEnableMusicHotkeys, getMusicSettingsStatus, truncateSongId, writeSongTxt } from '../core/settings';
import { getTrackByIndex, getTrackMetaByIndex, refreshPlaylist } from '../core/music';
import { getNowPlaying, setNowPlayingByIndex } from '../core/nowPlaying';
import { getJamStatus, onNowPlayingUpdated, setJamEnabled } from '../core/jam';
import { runChatCommands } from '../core/commands';
import YouTubeChatCapture from '../capture/youtube';
import TwitchChatCapture from '../capture/twitch';
import KickChatCapture from '../capture/kick';
import type { ChatEvent, Platform } from '../capture/types';
import { closeBrowser } from '../capture/browserPool';

/**
 * Typed events emitted by the App class.
 * In headless (Electron) mode these replace console output;
 * the Electron main process listens and forwards them over IPC.
 */
export interface AppEvents {
  'server-ready': (port: number) => void;
  'capture-status': (status: { status: string; platform?: string | null; videoId?: string | null; messageCount?: number; startedAt?: number }) => void;
  'capture-error': (error: string) => void;
  'log': (message: string) => void;
}

// Resolve static directories (overlay + admin)
const __dirnameResolved = __dirname;
const overlayStatic = path.resolve(__dirnameResolved, '..', '..', 'overlay');
const adminStatic = path.resolve(__dirnameResolved, '..', '..', 'admin');

// HTTP server + overlay + SSE wiring
class App extends EventEmitter {
  private app = express();
  private server = http.createServer(this.app);
  private io = new SocketIOServer(this.server, { cors: { origin: '*', methods: ['GET','POST'] } });
  private port = DEFAULT_PORT;
  private pendingPortConfirmation: number | null = null;
  private sse = new SSEHub<any>();
  private capture: YouTubeChatCapture | TwitchChatCapture | KickChatCapture | null = null;
  private currentPlatform: Platform | null = null;
  private isRunning = false;
  private messageCount = 0;
  private startTime: number | null = null;
  private currentVideoId: string | null = null;
  private currentUrl: string | null = null;
  private headless: boolean;
  private tui: TerminalUI | null = null;
  private musicHotkeysEnabled = false;

  // Overlay appearance settings (admin-controlled, broadcast via SSE)
  private appearance: Record<string, number | string | boolean> = { scale: 1.35 };
  private serverReadyResolve!: (port: number) => void;
  private serverReadyPromise: Promise<number>;

  private broadcastMusicControl(action: 'playPause' | 'prev' | 'next' | 'shuffle') {
    try {
      this.sse.send('music-control', { action, ts: Date.now() });
    } catch {
      // ignore
    }
  }

  private tryEnableMusicHotkeys() {
    if (this.musicHotkeysEnabled) return;
    if (!this.isRunning) return;
    if (!getEnableMusicHotkeys()) return;

    // Only enable after a real playlist exists.
    const current = refreshPlaylist();
    if (!current.playlist.length) return;

    const ok = this.tui?.enableMusicHotkeys((action) => {
      if (!this.isRunning) return;
      this.broadcastMusicControl(action);
    }) ?? false;

    this.musicHotkeysEnabled = ok;
  }

  private broadcastSystemMessage(text: string, opts?: { showUsername?: boolean; effects?: ChatEvent['effects'] }) {
    const msg: ChatEvent = {
      id: `sys_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      author: { name: 'ChallaChat', avatar: '', flags: { mod: true } },
      text: String(text || ''),
      kind: 'text',
      ts: Date.now(),
      showUsername: opts?.showUsername !== false,
      effects: opts?.effects
    };
    try { this.io.emit('chat-message', msg); } catch {}
    try { this.sse.send('chat', { events: [this.normalizeForOverlay(msg)] }); } catch {}
  }

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

  // Configure express, static files, and lightweight APIs
  private setupServer() {
    this.app.use(express.json());
    
    // Serve overlay static files directly from the filesystem
    this.app.use(express.static(overlayStatic));
    this.app.get('/overlay', (_req: Request, res: Response) => {
      res.sendFile(path.join(overlayStatic, 'index.html'));
    });

  this.app.get('/api/status', (_req: Request, res: Response) => {
      res.json(this.getStatus());
    });

  this.app.get('/api/poll-interval', (_req: Request, res: Response) => {
      res.json({ pollIntervalMs: this.capture?.pollInterval || DEFAULT_POLL_INTERVAL });
    });
  this.app.post('/api/poll-interval', (req: Request, res: Response) => {
      const next = clampPollInterval(Number(req.body?.pollIntervalMs));
      if (this.capture) this.capture.setPollInterval(next);
      res.json({ ok: true, pollIntervalMs: this.capture?.pollInterval || next });
    });

  this.app.get('/api/filter', (_req: Request, res: Response) => {
      res.json(getFilterStatus());
    });
  this.app.post('/api/filter/reload', (_req: Request, res: Response) => {
      const success = reloadFilter();
      res.json({ ok: success, ...getFilterStatus() });
    });
  this.app.post('/api/filter/toggle', (req: Request, res: Response) => {
      const active = req.body?.active;
      if (typeof active === 'boolean') {
        setFilterActive(active);
      }
      res.json({ ok: true, ...getFilterStatus() });
    });

  this.app.get('/api/logger', (_req: Request, res: Response) => {
      res.json(getLoggerStatus());
    });
  this.app.post('/api/logger/toggle', (req: Request, res: Response) => {
      const enabled = req.body?.enabled;
      if (typeof enabled === 'boolean') {
        setLogEnabled(enabled);
        // If enabling and currently capturing, start logging immediately
        if (enabled && this.isRunning && this.currentVideoId) {
          startLogging('yt');
        }
      }
      res.json({ ok: true, ...getLoggerStatus() });
    });

  this.app.get('/api/music', (_req: Request, res: Response) => {
      res.json(getMusicSettingsStatus());
    });

  this.app.get('/api/music/nowplaying', (_req: Request, res: Response) => {
      const now = getNowPlaying();
      res.json({ nowPlaying: now ? { index: now.index, songId: now.songId, updatedAt: now.updatedAt } : null });
    });

  this.app.post('/api/music/nowplaying', (req: Request, res: Response) => {
      const idx = Number(req.body?.index);
      if (!Number.isInteger(idx) || idx < 0) {
        res.status(400).json({ error: 'Invalid index' });
        return;
      }
      const songId = typeof req.body?.songId === 'string' ? req.body.songId : undefined;
      const now = setNowPlayingByIndex(idx, songId);
      const finale = onNowPlayingUpdated(now);
      if (finale) {
        const quotedSongId = `'${truncateSongId(String(finale.songId)).replace(/'/g, '’')}'`;
        this.broadcastSystemMessage(`${quotedSongId} got ${finale.jamCount} jams!`, { showUsername: false, effects: { jamFinale: true } });
      }
      res.json({ ok: true, nowPlaying: now ? { index: now.index, songId: now.songId, updatedAt: now.updatedAt } : null });
    });

  this.app.get('/api/jam', (_req: Request, res: Response) => {
      res.json(getJamStatus(getNowPlaying()));
    });

  this.app.post('/api/jam/toggle', (req: Request, res: Response) => {
      const enabled = req.body?.enabled;
      if (typeof enabled === 'boolean') {
        setJamEnabled(enabled);
      }
      res.json({ ok: true, ...getJamStatus(getNowPlaying()) });
    });

  this.app.get('/api/music/playlist', (_req: Request, res: Response) => {
      // Build playlist on demand (and refresh when path changes)
      const current = refreshPlaylist();
      res.json({
        musicPath: current.musicPath,
        playlist: current.playlist,
        count: current.playlist.length,
        scannedAt: current.scannedAt
      });
    });

  this.app.get('/api/music/track/:index/meta', async (req: Request, res: Response) => {
      const idx = Number(req.params.index);
      if (!Number.isInteger(idx) || idx < 0) {
        res.status(400).json({ error: 'Invalid index' });
        return;
      }

      const filePath = getTrackByIndex(idx);
      if (!filePath) {
        res.status(404).json({ error: 'Track not found' });
        return;
      }

      try {
        const meta = await getTrackMetaByIndex(idx);
        res.json({
          title: meta?.title ?? null,
          artist: meta?.artist ?? null
        });
      } catch {
        res.status(500).json({ error: 'Failed to read track metadata' });
      }
    });

  this.app.post('/api/music/songfile', async (req: Request, res: Response) => {
      const idx = Number(req.body?.index);
      if (!Number.isInteger(idx) || idx < 0) {
        res.status(400).json({ error: 'Invalid index' });
        return;
      }

      // Treat songfile writes as a signal for the current track (used by !jam tracking)
      const songId = typeof req.body?.songId === 'string' ? req.body.songId : undefined;
      const now = setNowPlayingByIndex(idx, songId);
      const finale = onNowPlayingUpdated(now);
      if (finale) {
        const quotedSongId = `'${truncateSongId(String(finale.songId)).replace(/'/g, '’')}'`;
        this.broadcastSystemMessage(`${quotedSongId} got ${finale.jamCount} jams!`, { showUsername: false, effects: { jamFinale: true } });
      }

      const filePath = getTrackByIndex(idx);
      if (!filePath) {
        res.status(404).json({ error: 'Track not found' });
        return;
      }

      let title: string | null = null;
      let artist: string | null = null;

      try {
        const meta = await getTrackMetaByIndex(idx);
        title = meta?.title ?? null;
        artist = meta?.artist ?? null;
      } catch {
        // ignore and fallback to filename
      }

      const fallbackTitle = path.basename(filePath, path.extname(filePath));
      const finalTitle = (typeof title === 'string' && title.trim()) ? title.trim() : fallbackTitle;
      const finalArtist = (typeof artist === 'string' && artist.trim()) ? artist.trim() : null;
      const details = finalArtist ? `${finalTitle} - ${finalArtist}` : finalTitle;
      const capped = truncateSongId(details);
      const line = getDisableSongIdNotes() ? `   ${capped}  ` : `\u266b  ${capped}  \u266b`;

      const writeResult = writeSongTxt(line);
      if (!writeResult.ok) {
        res.status(500).json({ error: 'Failed to write song file', path: writeResult.path });
        return;
      }

      res.json({ ok: true, path: writeResult.path, line });
    });

  this.app.get('/api/music/track/:index', (req: Request, res: Response) => {
      const idx = Number(req.params.index);
      const filePath = getTrackByIndex(idx);
      if (!filePath) {
        res.status(404).json({ error: 'Track not found' });
        return;
      }

      try {
        const stat = fs.statSync(filePath);
        const total = stat.size;
        const range = req.headers.range;

        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Accept-Ranges', 'bytes');

        if (range) {
          const m = /^bytes=(\d+)-(\d*)$/i.exec(range);
          if (!m) {
            res.status(416).end();
            return;
          }
          const start = Number(m[1]);
          const end = m[2] ? Number(m[2]) : total - 1;
          const clampedStart = Math.max(0, Math.min(total - 1, start));
          const clampedEnd = Math.max(clampedStart, Math.min(total - 1, end));
          const chunkSize = clampedEnd - clampedStart + 1;

          res.status(206);
          res.setHeader('Content-Range', `bytes ${clampedStart}-${clampedEnd}/${total}`);
          res.setHeader('Content-Length', String(chunkSize));
          fs.createReadStream(filePath, { start: clampedStart, end: clampedEnd }).pipe(res);
          return;
        }

        res.setHeader('Content-Length', String(total));
        fs.createReadStream(filePath).pipe(res);
      } catch {
        res.status(500).json({ error: 'Failed to read track' });
      }
    });

  // Overlay appearance (admin-controlled)
  this.app.get('/api/appearance', (_req: Request, res: Response) => {
      res.json(this.appearance);
    });
  this.app.post('/api/appearance', (req: Request, res: Response) => {
      const body = req.body;
      if (!body || typeof body !== 'object') {
        res.status(400).json({ error: 'Invalid body' });
        return;
      }
      // Merge only known keys
      if (typeof body.scale === 'number') {
        this.appearance.scale = Math.max(0.5, Math.min(3, body.scale));
      }
      // Broadcast to all overlay SSE clients
      this.sse.send('appearance', this.appearance);
      res.json({ ok: true, ...this.appearance });
    });

  this.app.get('/api/stream', (_req: Request, res: Response) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write(`event: ping\ndata: {"ts": ${Date.now()}}\n\n`);
      // Send current appearance immediately so overlay gets the latest on connect
      res.write(`event: appearance\ndata: ${JSON.stringify(this.appearance)}\n\n`);
      this.sse.add(res);
    });

  this.io.on('connection', (socket: Socket) => {
      socket.emit('capture-status', { status: this.isRunning ? 'active' : 'stopped', platform: this.currentPlatform, videoId: this.currentVideoId, messageCount: this.messageCount });
    });

  // Serve admin control panel (static files from admin/ directory)
  this.app.use('/admin', express.static(adminStatic));

  // API: connect to a livestream URL
  this.app.post('/api/connect', async (req: Request, res: Response) => {
      const url = req.body?.url;
      if (!url || typeof url !== 'string') {
        res.status(400).json({ ok: false, error: 'Missing or invalid URL.' });
        return;
      }
      const result = await this.apiConnect(url);
      res.json(result);
    });

  // API: disconnect current capture
  this.app.post('/api/disconnect', async (_req: Request, res: Response) => {
      await this.apiDisconnect();
      res.json({ ok: true });
    });

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

  // Start capture for the provided livestream URL (YouTube or Twitch)
  private async startScraping(url: string) {
    if (this.isRunning) { console.log('Already capturing. Use "stop" first to change streams.'); return; }

    const platform = this.detectPlatform(url);
    if (!platform) {
      throw new Error('Unsupported URL. Please provide a YouTube, Twitch, or Kick livestream URL.');
    }

    if (platform === 'youtube') {
      await this.startYouTubeCapture(url);
    } else if (platform === 'twitch') {
      await this.startTwitchCapture(url);
    } else if (platform === 'kick') {
      await this.startKickCapture(url);
    }
  }

  // Start YouTube-specific capture
  private async startYouTubeCapture(url: string) {
    const isStudioUrl = /^https?:\/\/studio\.youtube\.com\//i.test(String(url || ''));
    const videoId = this.extractVideoId(url);
    if (!videoId) throw new Error('Invalid YouTube URL. Please provide a valid YouTube livestream URL.');
    this.capture = new YouTubeChatCapture(videoId, {
      pollInterval: DEFAULT_POLL_INTERVAL,
      quiet: true,
      onMessage: (message) => this.onCaptureMessage(message),
      onDelete: (id) => this.onCaptureDelete(id),
      onError: (err) => { console.log(`[ERROR] ${err.message}`); this.emit('capture-error', err.message); },
      onStatusChange: (status) => { this.io.emit('capture-status', status); this.emit('capture-status', status); if (status?.status === 'active') this.tui?.render(); }
    });
    await this.capture.start();
    this.isRunning = true;
    this.currentPlatform = 'youtube';
    this.currentVideoId = videoId;
    // For creator/admin URLs, store a public-style URL so status display matches what viewers use.
    this.currentUrl = isStudioUrl ? this.toPublicLiveUrl(videoId) : url;
    this.messageCount = 0;
    this.startTime = Date.now();
    this.tui?.setUrl(this.currentUrl);
    // Start logging if enabled (uses 'yt' platform identifier)
    startLogging('yt');
    this.tui?.render();
    const captureStatus = { status: 'active' as const, videoId: this.currentVideoId, platform: 'youtube' as const, startedAt: this.startTime };
    this.io.emit('capture-status', captureStatus);
    this.emit('capture-status', captureStatus);

    // Enable terminal music hotkeys only after capture is active and music playlist exists.
    try { this.tryEnableMusicHotkeys(); } catch {}
  }

  // Start Twitch-specific capture
  private async startTwitchCapture(url: string) {
    const channel = this.extractTwitchChannel(url);
    if (!channel) throw new Error('Invalid Twitch URL. Please provide a valid Twitch channel URL.');
    this.capture = new TwitchChatCapture(channel, {
      pollInterval: DEFAULT_POLL_INTERVAL,
      quiet: true,
      onMessage: (message: ChatEvent) => this.onCaptureMessage(message),
      onDelete: (id: string) => this.onCaptureDelete(id),
      onError: (err: Error) => { console.log(`[ERROR] ${err.message}`); this.emit('capture-error', err.message); },
      onStatusChange: (status: any) => { this.io.emit('capture-status', status); this.emit('capture-status', status); if (status?.status === 'active') this.tui?.render(); }
    });
    await this.capture.start();
    this.isRunning = true;
    this.currentPlatform = 'twitch';
    this.currentVideoId = channel; // Use channel name as the identifier
    this.currentUrl = `https://www.twitch.tv/${channel}`;
    this.messageCount = 0;
    this.startTime = Date.now();
    this.tui?.setUrl(this.currentUrl);
    // Start logging if enabled (uses 'tw' platform identifier for Twitch)
    startLogging('tw');
    this.tui?.render();
    const captureStatus = { status: 'active' as const, channel, platform: 'twitch' as const, startedAt: this.startTime };
    this.io.emit('capture-status', captureStatus);
    this.emit('capture-status', captureStatus);

    // Enable terminal music hotkeys only after capture is active and music playlist exists.
    try { this.tryEnableMusicHotkeys(); } catch {}
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

  // Start Kick-specific capture
  private async startKickCapture(url: string) {
    const channel = this.extractKickChannel(url);
    if (!channel) throw new Error('Invalid Kick URL. Please provide a valid Kick channel URL.');
    this.capture = new KickChatCapture(channel, {
      pollInterval: DEFAULT_POLL_INTERVAL,
      quiet: true,
      onMessage: (message: ChatEvent) => this.onCaptureMessage(message),
      onDelete: (id: string) => this.onCaptureDelete(id),
      onError: (err: Error) => { console.log(`[ERROR] ${err.message}`); this.emit('capture-error', err.message); },
      onStatusChange: (status: any) => { this.io.emit('capture-status', status); this.emit('capture-status', status); if (status?.status === 'active') this.tui?.render(); }
    });
    await this.capture.start();
    this.isRunning = true;
    this.currentPlatform = 'kick';
    this.currentVideoId = channel; // Use channel name as the identifier
    this.currentUrl = `https://kick.com/${channel}`;
    this.messageCount = 0;
    this.startTime = Date.now();
    this.tui?.setUrl(this.currentUrl);
    // Start logging if enabled (uses 'kk' platform identifier for Kick)
    startLogging('kk');
    this.tui?.render();
    const captureStatus = { status: 'active' as const, channel, platform: 'kick' as const, startedAt: this.startTime };
    this.io.emit('capture-status', captureStatus);
    this.emit('capture-status', captureStatus);

    // Enable terminal music hotkeys only after capture is active and music playlist exists.
    try { this.tryEnableMusicHotkeys(); } catch {}
  }

  // Relay messages to SSE clients and overlay
  private onCaptureMessage(message: ChatEvent) {
    this.messageCount++;

    // Run chat commands (e.g. !jam) before censoring/broadcasting.
    try {
      runChatCommands(message, {
        nowPlaying: getNowPlaying(),
        broadcastSystemMessage: (text) => this.broadcastSystemMessage(text)
      });
    } catch {}

    // Apply profanity filter before broadcasting
    const filtered = censorMessage(message);
    // Log message to file (if logging is enabled)
    logMessage(filtered);
  // No terminal preview or re-rendering of the header during message flow.
    this.io.emit('chat-message', filtered);
    this.sse.send('chat', { events: [this.normalizeForOverlay(filtered)] });
  }

  // Relay delete events (by id) so overlays can remove them immediately
  private onCaptureDelete(id: string) {
    if (!id) return;
    try { this.io.emit('chat-delete', { id }); } catch {}
    try { this.sse.send('chat', { events: [{ type: 'delete', id }] as any }); } catch {}
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
      effects: message.effects,
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

  private toPublicLiveUrl(videoId: string): string {
    return `https://www.youtube.com/live/${videoId}`;
  }

  // Gracefully stop the capture and summarize the session
  private async shutdownCapture() {
    if (!this.isRunning) return;
    try { await this.capture?.stop(); } catch (e: any) { console.log(`Error stopping capture: ${e?.message || e}`); }
    // Stop logging when capture ends
    stopLogging();
    const duration = Math.round(((Date.now() - (this.startTime || Date.now())) / 1000));
    console.log('Chat capture stopped');
    console.log(`Session duration: ${duration} seconds`);
    console.log(`Messages captured: ${this.messageCount}`);
    this.isRunning = false; this.currentVideoId = null; this.currentUrl = null; this.capture = null; this.startTime = null; this.currentPlatform = null;
    try { this.tui?.disableMusicHotkeys(); } catch {}
    this.musicHotkeysEnabled = false;
    const stoppedStatus = { status: 'stopped' as const, platform: null };
    this.io.emit('capture-status', stoppedStatus);
    this.emit('capture-status', stoppedStatus);
  }

  // --- Public API (used by Electron main process and REST endpoints) ---

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
    return {
      isRunning: this.isRunning,
      platform: this.currentPlatform,
      videoId: this.currentVideoId,
      url: this.currentUrl,
      messageCount: this.messageCount,
      uptime: this.startTime ? Date.now() - this.startTime : 0,
      pollIntervalMs: this.capture?.pollInterval || null,
      overlayUrl: `http://localhost:${this.port}/`,
    };
  }

  /** Connect to a livestream URL. Returns a result object. */
  async apiConnect(url: string): Promise<{ ok: boolean; platform?: string; videoId?: string; error?: string }> {
    if (this.isRunning) {
      return { ok: false, error: 'Already capturing. Disconnect first.' };
    }
    try {
      await this.ensureServer();
      await this.startScraping(url);
      return { ok: true, platform: this.currentPlatform ?? undefined, videoId: this.currentVideoId ?? undefined };
    } catch (e: any) {
      return { ok: false, error: e?.message || String(e) };
    }
  }

  /** Disconnect the current capture session. */
  async apiDisconnect(): Promise<void> {
    await this.shutdownCapture();
  }

  async shutdown(): Promise<void> {
    await this.shutdownCapture();
    await closeBrowser();
    return new Promise<void>((resolve) => {
      this.server.close(() => {
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
