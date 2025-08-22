/* eslint-disable no-console */
import express, { type Request, type Response } from 'express';
import http from 'http';
import path from 'path';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import { DEFAULT_PORT, DEFAULT_POLL_INTERVAL, clampPollInterval } from '../core/config';
import { SSEHub } from '../core/sseHub';
import { TerminalUI } from '../core/terminalUi';
import YouTubeChatScraper from '../scraper/youtube';
import type { ChatEvent } from '../scraper/types';

// __dirname is available in CommonJS; TS compiles to CJS per tsconfig
const __dirnameResolved = __dirname;

// HTTP server + overlay + SSE wiring
class App {
  private app = express();
  private server = http.createServer(this.app);
  private io = new SocketIOServer(this.server, { cors: { origin: '*', methods: ['GET','POST'] } });
  private port = DEFAULT_PORT;
  private pendingPortConfirmation: number | null = null;
  private sse = new SSEHub<{ events: ChatEvent[] }>();
  private scraper: YouTubeChatScraper | null = null;
  private isRunning = false;
  private messageCount = 0;
  private startTime: number | null = null;
  private currentVideoId: string | null = null;
  private currentUrl: string | null = null;
  private tui = new TerminalUI(this.port);

  constructor() {
  this.setupServer();
  this.setupTerminal();
  this.handleSignals();
  // Attempt initial bind and if in use, prompt for a new port repeatedly
  this.ensureServerWithRetry().then(() => {
    this.tui.showWelcome();
    this.tui.prompt();
  });
  }

  // Configure express, static files, and lightweight APIs
  private setupServer() {
    this.app.use(express.json());
  const staticDir = path.resolve(__dirnameResolved, '..', '..', 'static');
    this.app.use(express.static(staticDir));
  this.app.get('/', (_req: Request, res: Response) => res.sendFile(path.join(staticDir, 'index.html')));
  this.app.get('/overlay', (_req: Request, res: Response) => res.sendFile(path.join(staticDir, 'index.html')));

  this.app.get('/api/status', (_req: Request, res: Response) => {
      res.json({
        isRunning: this.isRunning,
        videoId: this.currentVideoId,
        url: this.currentUrl,
        messageCount: this.messageCount,
        uptime: this.startTime ? Date.now() - this.startTime : 0,
        pollIntervalMs: this.scraper?.pollInterval || null,
        overlayUrl: `http://localhost:${this.port}/`
      });
    });

  this.app.get('/api/poll-interval', (_req: Request, res: Response) => {
      res.json({ pollIntervalMs: this.scraper?.pollInterval || DEFAULT_POLL_INTERVAL });
    });
  this.app.post('/api/poll-interval', (req: Request, res: Response) => {
      const next = clampPollInterval(Number(req.body?.pollIntervalMs));
      if (this.scraper) this.scraper.setPollInterval(next);
      res.json({ ok: true, pollIntervalMs: this.scraper?.pollInterval || next });
    });

  this.app.get('/api/stream', (_req: Request, res: Response) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write(`event: ping\ndata: {"ts": ${Date.now()}}\n\n`);
      this.sse.add(res);
    });

  this.io.on('connection', (socket: Socket) => {
      socket.emit('scraper-status', { status: this.isRunning ? 'active' : 'stopped', videoId: this.currentVideoId, messageCount: this.messageCount });
    });

  // Do not auto-listen here; let ensureServerWithRetry handle binding and retry prompts
  }

  // Wire terminal input handlers; actual prompt is shown after port bind
  private setupTerminal() {
  // Do not prompt until we are successfully listening on a port
    this.tui.onLine(async (line) => {
      const trimmed = line.trim();
      if (!trimmed) { this.tui.prompt(); return; }
      if (/^(quit|exit)$/i.test(trimmed)) { await this.shutdown(); return; }
      try {
        await this.ensureServer();
        this.tui.showConnectingOnce();
        await this.startScraping(trimmed);
      } catch (e: any) {
        console.log(`Error: ${e?.message || String(e)}`);
        this.tui.prompt();
      }
    });
    this.tui.onClose(() => { this.shutdown(); });
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
    // Try to listen; on EADDRINUSE, prompt for another port until success.
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
          console.log(`Port ${this.port} is in use.`);
          // Ask user for a new port
          const ans = await this.tui.askOnce('Enter a different port number');
          const next = parseInt(ans, 10);
          if (!Number.isFinite(next) || next <= 0 || next > 65535) {
            console.log('Please enter a valid port number between 1 and 65535.');
            continue;
          }
          this.port = next;
          this.tui.setPort(this.port);
          this.pendingPortConfirmation = this.port;
          // Update Express to reflect the new port in status API
          // No explicit Express change needed; only server.listen uses the port.
          continue;
        }
        // Unknown error: show concise message, not stack
        console.log(`Failed to bind to port ${this.port}: ${err?.message || String(err)}`);
        const ans = await this.tui.askOnce('Enter a different port');
        const next = parseInt(ans, 10);
        if (!Number.isFinite(next) || next <= 0 || next > 65535) {
          console.log('Please enter a valid port number between 1 and 65535.');
          continue;
        }
        this.port = next;
        this.tui.setPort(this.port);
        this.pendingPortConfirmation = this.port;
      }
    }
  }

  // Start scraper for the provided livestream URL
  private async startScraping(url: string) {
    if (this.isRunning) { console.log('Already scraping. Use "stop" first to change streams.'); return; }
    const videoId = this.extractVideoId(url);
    if (!videoId) throw new Error('Invalid YouTube URL. Please provide a valid YouTube livestream URL.');
    this.scraper = new YouTubeChatScraper(videoId, {
      pollInterval: DEFAULT_POLL_INTERVAL,
      quiet: true,
      onMessage: (message) => this.onScraperMessage(message),
      onError: (err) => console.log(`[ERROR] ${err.message}`),
      onStatusChange: (status) => { this.io.emit('scraper-status', status); if (status?.status === 'active') this.tui.render(); }
    });
    await this.scraper.start();
    this.isRunning = true;
    this.currentVideoId = videoId;
    this.currentUrl = url;
    this.messageCount = 0;
    this.startTime = Date.now();
    this.tui.setUrl(url);
  this.tui.render();
    this.io.emit('scraper-status', { status: 'active', videoId: this.currentVideoId, startedAt: this.startTime });
  }

  // Relay messages to SSE clients and overlay
  private onScraperMessage(message: ChatEvent) {
    this.messageCount++;
  // No terminal preview or re-rendering of the header during message flow.
    this.io.emit('chat-message', message);
    this.sse.send('chat', { events: [this.normalizeForOverlay(message)] });
  }

  // Normalize event shape for the overlay client
  private normalizeForOverlay(message: ChatEvent): ChatEvent {
    const flags = message.author?.flags || { owner: false, mod: false, verified: false, member: false };
    return {
      id: message.id || `yt_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
      author: { name: message.author?.name || 'User', avatar: message.author?.avatar || '', flags, badges: message.author?.badges },
      text: message.text || '',
      segments: message.segments,
      kind: message.kind || 'text',
      ts: message.ts || Date.now(),
      amountDisplay: message.amountDisplay,
      color: message.color
    };
  }

  // Support multiple YouTube URL shapes for extracting the video id
  private extractVideoId(url: string): string | null {
    try {
      const u = new URL(url);
      if (u.pathname === '/watch') return u.searchParams.get('v');
      if (u.pathname.startsWith('/live/')) return u.pathname.replace('/live/', '');
      if (u.pathname === '/live_chat') return u.searchParams.get('v');
      if (u.hostname === 'youtu.be') return u.pathname.slice(1);
    } catch {
      const regex = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/live\/|youtube\.com\/live_chat\?v=)([^&\n?#]+)/;
      const match = url.match(regex);
      return match ? match[1] : null;
    }
    return null;
  }

  // Gracefully stop the scraper and summarize the session
  private async shutdownScraper() {
    if (!this.isRunning) return;
    try { await this.scraper?.stop(); } catch (e: any) { console.log(`Error stopping scraper: ${e?.message || e}`); }
    const duration = Math.round(((Date.now() - (this.startTime || Date.now())) / 1000));
    console.log('Chat scraper stopped');
    console.log(`Session duration: ${duration} seconds`);
    console.log(`Messages captured: ${this.messageCount}`);
    this.isRunning = false; this.currentVideoId = null; this.currentUrl = null; this.scraper = null; this.startTime = null;
    this.io.emit('scraper-status', { status: 'stopped' });
  }

  async shutdown() {
    await this.shutdownScraper();
    this.server.close(() => { console.log('Server closed. Goodbye!'); process.exit(0); });
  }
}

new App();
