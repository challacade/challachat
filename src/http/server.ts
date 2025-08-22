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

class App {
  private app = express();
  private server = http.createServer(this.app);
  private io = new SocketIOServer(this.server, { cors: { origin: '*', methods: ['GET','POST'] } });
  private port = DEFAULT_PORT;
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
  }

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

    // Start listening immediately so static overlay and APIs are available
    if (!(this.server as any)._listening) {
      this.server.listen(this.port, () => { (this.server as any)._listening = true; });
    }
  }

  private setupTerminal() {
    this.tui.prompt();
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

  private async ensureServer() {
    if ((this.server as any)._listening) return;
    await new Promise<void>((resolve) => {
      this.server.listen(this.port, () => { (this.server as any)._listening = true; resolve(); });
    });
  }

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

  private onScraperMessage(message: ChatEvent) {
    this.messageCount++;
  // No terminal preview or re-rendering of the header during message flow.
    this.io.emit('chat-message', message);
    this.sse.send('chat', { events: [this.normalizeForOverlay(message)] });
  }

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
