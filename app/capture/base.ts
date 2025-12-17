/* eslint-disable no-console */
import puppeteer, { Browser, Page, HTTPRequest } from 'puppeteer';
import { ChatEvent, CaptureOptions } from './types';

/**
 * Simple hash function for generating stable message IDs.
 * Used inside page.evaluate() - must be self-contained.
 */
export function cyrb53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const combined = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return combined.toString(36);
}

export interface CaptureCallbacks {
  onMessage: (m: ChatEvent) => void;
  onError: (e: Error) => void;
  onStatus: (s: any) => void;
  onDelete: (id: string) => void;
}

export interface CaptureOpts {
  pollInterval: number;
  quiet: boolean;
  maxRetries: number;
  retryDelay: number;
}

/**
 * BaseChatCapture - Abstract base class for platform-specific chat capture implementations.
 * Handles browser launching, retry logic, polling lifecycle, and cleanup.
 */
export abstract class BaseChatCapture {
  protected browser: Browser | null = null;
  protected page: Page | null = null;
  protected isRunning = false;
  protected seenIds = new Set<string>();
  protected pollTimer: NodeJS.Timeout | null = null;
  protected opts: CaptureOpts;
  protected callbacks: CaptureCallbacks;

  /** Platform identifier for logging (e.g., 'Capture', 'Twitch') */
  protected abstract readonly logPrefix: string;

  /** The URL to navigate to for chat */
  protected abstract readonly chatUrl: string;

  /** Viewport dimensions for the browser page */
  protected get viewport(): { width: number; height: number } {
    return { width: 1280, height: 720 };
  }

  constructor(options: CaptureOptions = {}) {
    this.opts = {
      pollInterval: options.pollInterval ?? 1000,
      quiet: !!options.quiet,
      maxRetries: options.maxRetries ?? 3,
      retryDelay: options.retryDelay ?? 5000
    };
    this.callbacks = {
      onMessage: options.onMessage ?? (() => {}),
      onError: options.onError ?? (() => {}),
      onStatus: options.onStatusChange ?? (() => {}),
      onDelete: options.onDelete ?? (() => {})
    };
  }

  get pollInterval() { return this.opts.pollInterval; }

  setPollInterval(ms: number) {
    const n = Math.max(100, Math.floor(Number(ms) || 0));
    if (!Number.isFinite(n)) return;
    this.opts.pollInterval = n;
    if (this.isRunning) this.startPolling();
  }

  /** Emit status to callback */
  protected emitStatus(status: any) {
    this.callbacks.onStatus(status);
  }

  /** Log message if not in quiet mode */
  protected log(message: string) {
    if (!this.opts.quiet) console.log(`[${this.logPrefix}] ${message}`);
  }

  /** Log error if not in quiet mode */
  protected logError(message: string) {
    if (!this.opts.quiet) console.error(`[${this.logPrefix}] ${message}`);
  }

  /** Get starting status payload - override to add platform-specific fields */
  protected abstract getStartingStatus(): any;

  /** Get active status payload - override to add platform-specific fields */
  protected abstract getActiveStatus(): any;

  /** CSS selectors to wait for to confirm chat is loaded */
  protected abstract getChatSelectors(): string[];

  /** Called during navigation to filter requests (return true to abort) */
  protected shouldAbortRequest(resourceType: string, url: string): boolean {
    // By default, block media and fonts
    if (resourceType === 'media' || resourceType === 'font') return true;
    return false;
  }

  /** Poll the page for messages - must be implemented by subclass */
  protected abstract pollMessages(): Promise<void>;

  async start() {
    if (this.isRunning) throw new Error('Capture is already running');
    this.log(`Starting...`);
    this.emitStatus(this.getStartingStatus());

    let lastErr: Error | null = null;
    for (let attempt = 1; attempt <= this.opts.maxRetries; attempt++) {
      try {
        this.log(`Attempt ${attempt}/${this.opts.maxRetries}`);
        this.browser = await this.launchBrowser();
        this.page = await this.browser.newPage();
        this.page.setDefaultTimeout(90000);
        this.page.setDefaultNavigationTimeout(90000);
        await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
        await this.page.setViewport({ ...this.viewport, deviceScaleFactor: 1 });
        await this.page.setRequestInterception(true);
        this.page.on('request', (req: HTTPRequest) => {
          const rt = req.resourceType();
          const url = req.url();
          if (this.shouldAbortRequest(rt, url)) return req.abort();
          return req.continue();
        });

        await this.navigate(attempt);
        await this.waitForChat();
        this.isRunning = true;
        this.emitStatus(this.getActiveStatus());
        this.log('Successfully started, beginning message polling...');
        this.startPolling();
        return;
      } catch (e: any) {
        lastErr = e instanceof Error ? e : new Error(String(e));
        await this.cleanup();
        if (attempt < this.opts.maxRetries) {
          this.log(`Retrying in ${this.opts.retryDelay}ms...`);
          await new Promise(res => setTimeout(res, this.opts.retryDelay));
        }
      }
    }

    const msg = `Failed to start capture after ${this.opts.maxRetries} attempts. Last error: ${lastErr?.message || 'Unknown error'}`;
    this.logError(msg);
    const err = new Error(msg);
    this.callbacks.onError(err);
    throw err;
  }

  async stop() {
    if (!this.isRunning) return;
    this.log('Stopping...');
    this.isRunning = false;
    this.emitStatus({ status: 'stopping' });
    await this.cleanup();
    this.emitStatus({ status: 'stopped' });
    this.log('Stopped');
  }

  protected async cleanup() {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    if (this.page) { try { await this.page.close(); } catch {} this.page = null; }
    if (this.browser) { try { await this.browser.close(); } catch {} this.browser = null; }
  }

  protected startPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(async () => {
      if (!this.isRunning || !this.page) return;
      try {
        await this.pollMessages();
      } catch (err: any) {
        this.logError(`Error during polling: ${err?.message || err}`);
        if ((err?.message || '').includes('Protocol error') || (err?.message || '').includes('Target closed')) {
          this.log('Browser connection lost, stopping...');
          await this.stop();
        }
      }
    }, this.opts.pollInterval);
  }

  /** Check if the page loaded successfully even if navigation timed out */
  protected abstract isValidPage(): Promise<boolean>;

  protected async navigate(attempt: number) {
    if (!this.page) throw new Error('No page');
    const opts = attempt === 1
      ? ({ waitUntil: 'domcontentloaded', timeout: 30000 } as const)
      : attempt === 2
      ? ({ waitUntil: 'load', timeout: 60000 } as const)
      : ({ waitUntil: 'networkidle2', timeout: 90000 } as const);
    try {
      await this.page.goto(this.chatUrl, opts);
    } catch (e) {
      // Check if we at least got to a valid page
      if (await this.isValidPage()) return;
      throw e;
    }
  }

  protected async waitForChat() {
    if (!this.page) throw new Error('No page');
    const selectors = this.getChatSelectors();
    const start = Date.now();
    const max = 60000;
    while (Date.now() - start < max) {
      for (const sel of selectors) {
        try {
          await this.page.waitForSelector(sel, { timeout: 2000 });
          return;
        } catch {}
      }
      await new Promise(r => setTimeout(r, 2000));
    }
    // Final check - maybe page is valid even without matching selectors
    if (await this.isValidPage()) return;
    throw new Error('Chat elements not found after waiting 60 seconds');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Browser launching logic (shared across all platforms)
  // ─────────────────────────────────────────────────────────────────────────────

  private buildLaunchArgs(): string[] {
    return [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=TranslateUI,VizDisplayCompositor,site-per-process',
      '--disable-extensions',
      '--disable-plugins',
      '--mute-audio',
      '--disable-web-security'
    ];
  }

  private async launchBrowser(): Promise<Browser> {
    const base: any = { headless: true, args: this.buildLaunchArgs(), timeout: 60000, protocolTimeout: 60000 };
    // 1) Try using system Chrome via channel
    try {
      return await puppeteer.launch({ ...base, channel: 'chrome' as any });
    } catch {}
    // 2) Try using system Microsoft Edge
    try {
      return await puppeteer.launch({ ...base, channel: 'msedge' as any });
    } catch {}
    // 3) Try common install paths explicitly
    if (process.platform === 'win32') {
      for (const exe of this.findWindowsBrowserPaths()) {
        try { return await puppeteer.launch({ ...base, executablePath: exe }); } catch {}
      }
    }
    if (process.platform === 'darwin') {
      for (const exe of this.findMacBrowserPaths()) {
        try { return await puppeteer.launch({ ...base, executablePath: exe }); } catch {}
      }
    }
    if (process.platform === 'linux') {
      for (const exe of this.findLinuxBrowserPaths()) {
        try { return await puppeteer.launch({ ...base, executablePath: exe }); } catch {}
      }
    }
    // 4) Fall back to default (managed) Chrome-for-Testing
    try {
      return await puppeteer.launch(base);
    } catch (e) {
      throw new Error('No Chrome/Edge found. Please install Google Chrome or Microsoft Edge and try again.');
    }
  }

  private findWindowsBrowserPaths(): string[] {
    const paths: string[] = [];
    const env = process.env;
    const candidates = [
      `${env['PROGRAMFILES']}\\Google\\Chrome\\Application\\chrome.exe`,
      `${env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`,
      `${env['PROGRAMW6432']}\\Google\\Chrome\\Application\\chrome.exe`,
      `${env['LOCALAPPDATA']}\\Google\\Chrome\\Application\\chrome.exe`,
      `${env['PROGRAMFILES']}\\Microsoft\\Edge\\Application\\msedge.exe`,
      `${env['PROGRAMFILES(X86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
      `${env['PROGRAMW6432']}\\Microsoft\\Edge\\Application\\msedge.exe`,
      `${env['LOCALAPPDATA']}\\Microsoft\\Edge\\Application\\msedge.exe`
    ];
    for (const p of candidates) {
      if (p && p.trim().length > 0) paths.push(p);
    }
    return paths;
  }

  private findMacBrowserPaths(): string[] {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium'
    ];
  }

  private findLinuxBrowserPaths(): string[] {
    return [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/usr/bin/microsoft-edge',
      '/snap/bin/chromium'
    ];
  }
}
