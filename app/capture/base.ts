/* eslint-disable no-console */
import { Browser, Page, HTTPRequest } from 'puppeteer-core';
import { ChatEvent, CaptureOptions } from './types';
import { acquireBrowser } from './browserPool';
import { DEFAULT_POLL_INTERVAL } from '../core/config';

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
 * Simple hash function for generating stable message IDs.
 * NOTE: This function is injected as a string into the browser context
 * via evaluateOnNewDocument (see BaseChatCapture.start). It is not
 * called at runtime in Node - only inside headless browser pages as
 * window.__cyrb53.
 */
function cyrb53(str: string, seed = 0): string {
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

/**
 * BaseChatCapture - Abstract base class for platform-specific chat capture.
 *
 * Uses BrowserPool for a shared headless browser instance.  Only pages are
 * created/destroyed per capture session - the browser itself survives across
 * connect/disconnect cycles for fast re-connects.
 */
export abstract class BaseChatCapture {
  protected browser: Browser | null = null;
  protected page: Page | null = null;
  protected isRunning = false;
  protected seenIds = new Set<string>();
  /** Maps lowercased author name → set of message IDs they sent (for ban-based bulk deletion) */
  protected authorMessageIds = new Map<string, Set<string>>();
  /** Content fingerprint → first emission timestamp. Prevents high-priority events re-firing when DOM element IDs change (e.g. countdown progress bar re-renders). */
  private recentHighPriorityFingerprints = new Map<string, number>();
  /** How long (ms) to suppress a high-priority event with the same content fingerprint. Covers DOM re-render / element ID churn scenarios (typically a few seconds) with margin. */
  private readonly FINGERPRINT_TTL_MS = 60 * 1000;
  /** Tracks how many times each message ID has been emitted this session. */
  private messageEmitCounts = new Map<string, number>();
  /** Maximum number of times a single message ID may fire before being permanently suppressed. */
  private readonly MAX_EMIT_COUNT = 3;
  protected pollTimer: NodeJS.Timeout | null = null;
  protected opts: CaptureOpts;
  protected callbacks: CaptureCallbacks;

  /** Platform identifier for logging (e.g., 'Capture', 'Twitch') */
  protected abstract readonly logPrefix: string;

  /** The URL to navigate to for chat */
  protected abstract readonly chatUrl: string;

  /** Prefix used for hash-generated message IDs (e.g. 'h_', 'tw_', 'kick_') */
  protected abstract readonly hashPrefix: string;

  /** Domain substring to match in URL for page validation */
  protected abstract readonly platformDomain: string;

  /** Platform name to match in page title (lowercase) */
  protected abstract readonly platformName: string;

  /** Message kinds considered high-priority (always emitted even without text/segments) */
  protected readonly highPriorityKinds: string[] = [];

  /** Viewport dimensions for the browser page */
  protected get viewport(): { width: number; height: number } {
    return { width: 1280, height: 720 };
  }

  constructor(options: CaptureOptions = {}) {
    this.opts = {
      pollInterval: options.pollInterval ?? DEFAULT_POLL_INTERVAL,
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
        this.browser = await acquireBrowser();
        this.page = await this.browser.newPage();
        this.page.setDefaultTimeout(90000);
        this.page.setDefaultNavigationTimeout(90000);
        await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
        // Inject cyrb53 hash into browser context (used by all platform scrapers)
        await this.page.evaluateOnNewDocument(`
          window.__cyrb53 = function(str, seed) {
            seed = seed || 0;
            var h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
            for (var i = 0, ch; i < str.length; i++) {
              ch = str.charCodeAt(i);
              h1 = Math.imul(h1 ^ ch, 2654435761);
              h2 = Math.imul(h2 ^ ch, 1597334677);
            }
            h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
            h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
            var combined = 4294967296 * (2097151 & h2) + (h1 >>> 0);
            return combined.toString(36);
          };
        `);
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
    const base = this.getActiveStatus();
    this.emitStatus({ ...base, status: 'stopping' });
    await this.cleanup();
    this.emitStatus({ ...base, status: 'stopped' });
    this.log('Stopped');
  }

  /**
   * Cleanup the page only - the browser is shared via BrowserPool and stays
   * alive for subsequent capture sessions.
   */
  protected async cleanup() {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    if (this.page) { try { await this.page.close(); } catch { /* ignore - page may already be closed */ } this.page = null; }
    // Do NOT close the browser - it's shared via BrowserPool
    this.browser = null;
    this.authorMessageIds.clear();
    this.recentHighPriorityFingerprints.clear();
    this.messageEmitCounts.clear();
  }

  /** Delete all tracked messages for a given author (used when a ban is detected). */
  protected deleteMessagesByAuthor(authorName: string): void {
    const key = authorName.toLowerCase();
    const ids = this.authorMessageIds.get(key);
    if (!ids || ids.size === 0) return;
    for (const id of ids) {
      if (this.seenIds.has(id)) {
        this.callbacks.onDelete(id);
        this.seenIds.delete(id);
      }
    }
    this.authorMessageIds.delete(key);
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
  protected async isValidPage(): Promise<boolean> {
    if (!this.page) return false;
    try {
      const url = this.page.url();
      const title = await this.page.title();
      return url.includes(this.platformDomain) || title.toLowerCase().includes(this.platformName);
    } catch {
      return false;
    }
  }

  /**
   * Process raw messages from page.evaluate(), handling dedup, emission, and deletion detection.
   * Called by subclass pollMessages() after scraping.
   */
  protected processRawMessages(result: { messages: any[]; visibleIds: string[]; deletedIds?: string[]; bannedUsers?: string[] }): void {
    const messages = result.messages || [];
    const visibleRendererIds = new Set(result.visibleIds || []);
    const deletedRendererIds = result.deletedIds ? new Set(result.deletedIds) : null;

    for (const message of messages) {
      const hasText = typeof message.text === 'string' && message.text.trim().length > 0;
      const hasSegments = Array.isArray(message.segments) && message.segments.length > 0;
      const isHighPriority = !!message.hasCard || this.highPriorityKinds.includes(message.kind);
      if (!this.seenIds.has(message.id) && (hasText || hasSegments || isHighPriority)) {
        this.seenIds.add(message.id);

        // ── High-priority content dedup ────────────────────────────────────
        // Prevents the same donation/gift/sub event from re-firing if its DOM
        // element's id attribute changes (e.g. countdown progress bar re-render)
        // or if the element briefly leaves and re-enters the DOM.
        if (this.highPriorityKinds.includes(message.kind)) {
          const fp = `${message.kind}|${(message.author?.name || '').toLowerCase()}|${(message.text || '').trim()}|${message.amountDisplay || ''}|${message.giftCount || ''}`;
          const lastEmit = this.recentHighPriorityFingerprints.get(fp);
          if (lastEmit !== undefined && (Date.now() - lastEmit) < this.FINGERPRINT_TTL_MS) {
            // Same content was emitted recently — skip the callback but keep in seenIds
            continue;
          }
          this.recentHighPriorityFingerprints.set(fp, Date.now());
        }

        // ── Rate-limit failsafe ────────────────────────────────────────────
        // Catches any remaining edge case where the same message ID somehow
        // escapes seenIds and fires repeatedly (e.g. unforeseen platform changes).
        const emitCount = (this.messageEmitCounts.get(message.id) ?? 0) + 1;
        this.messageEmitCounts.set(message.id, emitCount);
        if (emitCount > this.MAX_EMIT_COUNT) {
          this.logError(`[ALERT LOOP PROTECTION] "${message.id}" (${message.kind} by ${message.author?.name || 'unknown'}) has been emitted ${emitCount} times — suppressing further emissions.`);
          continue;
        }

        const evt: ChatEvent = {
          id: message.id,
          author: message.author,
          text: message.text || '',
          segments: message.segments,
          kind: message.kind || 'text',
          ts: message.timestamp || Date.now(),
          amountDisplay: message.amountDisplay,
          color: message.color,
          hasCard: message.hasCard,
          systemMessage: message.systemMessage,
          replyTo: message.replyTo,
          rewardName: message.rewardName,
          months: message.months,
          giftCount: message.giftCount,
          totalGifted: message.totalGifted,
        };
        this.callbacks.onMessage(evt);
      }
    }

    // Track author → message ID mappings for ban-based bulk deletion
    for (const message of messages) {
      const authorName = message.author?.name;
      const id = message.id;
      if (authorName && id && this.seenIds.has(id)) {
        const key = authorName.toLowerCase();
        let ids = this.authorMessageIds.get(key);
        if (!ids) { ids = new Set(); this.authorMessageIds.set(key, ids); }
        ids.add(id);
      }
    }

    // Deletion detection - check ALL tracked IDs (both DOM-assigned and hash-generated)
    for (const id of Array.from(this.seenIds)) {
      if ((deletedRendererIds && deletedRendererIds.has(id)) || !visibleRendererIds.has(id)) {
        this.callbacks.onDelete(id);
        this.seenIds.delete(id);
      }
    }

    // Ban-based bulk deletion - remove all messages from banned/timed-out users
    if (result.bannedUsers) {
      for (const user of result.bannedUsers) {
        if (user) this.deleteMessagesByAuthor(user);
      }
    }
  }

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
        } catch { /* expected - selector not yet available, keep trying */ }
      }
      await new Promise(r => setTimeout(r, 2000));
    }
    // Final check - maybe page is valid even without matching selectors
    if (await this.isValidPage()) return;
    throw new Error('Chat elements not found after waiting 60 seconds');
  }
}
