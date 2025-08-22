/* eslint-disable no-console */
import puppeteer, { Browser, Page, HTTPRequest } from 'puppeteer';
import { ChatEvent, ScraperOptions } from './types';

export class YouTubeChatScraper {
  private videoId: string;
  private chatUrl: string;
  private browser: Browser | null = null;
  private page: Page | null = null;
  private isRunning = false;
  private seenIds = new Set<string>();
  private pollTimer: NodeJS.Timeout | null = null;
  private opts: Required<Pick<ScraperOptions, 'pollInterval' | 'quiet' | 'maxRetries' | 'retryDelay'>>;
  private onMessage: (m: ChatEvent) => void;
  private onError: (e: Error) => void;
  private onStatus: (s: any) => void;

  constructor(videoId: string, options: ScraperOptions = {}) {
    this.videoId = videoId;
    this.chatUrl = `https://www.youtube.com/live_chat?v=${videoId}`;
    this.opts = {
      pollInterval: options.pollInterval ?? 1000,
      quiet: !!options.quiet,
      maxRetries: options.maxRetries ?? 3,
      retryDelay: options.retryDelay ?? 5000
    };
    this.onMessage = options.onMessage ?? (() => {});
    this.onError = options.onError ?? (() => {});
    this.onStatus = options.onStatusChange ?? (() => {});
  }

  get pollInterval() { return this.opts.pollInterval; }
  setPollInterval(ms: number) {
    const n = Math.max(100, Math.floor(Number(ms) || 0));
    if (!Number.isFinite(n)) return;
    this.opts.pollInterval = n;
    if (this.isRunning) this.startPolling();
  }

  async start() {
    if (this.isRunning) throw new Error('Scraper is already running');
    if (!this.opts.quiet) console.log(`[Scraper] Starting for video: ${this.videoId}`);
    this.onStatus({ status: 'starting', videoId: this.videoId });
    let lastErr: Error | null = null;
    for (let attempt = 1; attempt <= this.opts.maxRetries; attempt++) {
      try {
        if (!this.opts.quiet) console.log(`[Scraper] Attempt ${attempt}/${this.opts.maxRetries}`);
        this.browser = await puppeteer.launch({
          headless: true,
          args: [
            '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote', '--disable-gpu', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-features=TranslateUI,VizDisplayCompositor', '--disable-extensions', '--disable-plugins', '--mute-audio', '--disable-web-security', '--disable-features=site-per-process'
          ],
          timeout: 60000,
          protocolTimeout: 60000
        });
        this.page = await this.browser.newPage();
        this.page.setDefaultTimeout(90000);
        this.page.setDefaultNavigationTimeout(90000);
        await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
        await this.page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
        await this.page.setRequestInterception(true);
  this.page.on('request', (req: HTTPRequest) => {
          const rt = req.resourceType();
          const url = req.url();
          if (rt === 'media' || url.includes('googlevideo.com') || url.includes('youtube.com/watch')) return req.abort();
          if (rt === 'font') return req.abort();
          return req.continue();
        });

        await this.navigate(attempt);
        await this.waitForChat();
        this.isRunning = true;
        this.onStatus({ status: 'active', videoId: this.videoId });
        if (!this.opts.quiet) console.log('[Scraper] Successfully started, beginning message polling...');
        this.startPolling();
        return;
      } catch (e: any) {
        lastErr = e instanceof Error ? e : new Error(String(e));
        await this.cleanup();
        if (attempt < this.opts.maxRetries) {
          if (!this.opts.quiet) console.log(`[Scraper] Retrying in ${this.opts.retryDelay}ms...`);
          await new Promise(res => setTimeout(res, this.opts.retryDelay));
        }
      }
    }
    const msg = `Failed to start scraper after ${this.opts.maxRetries} attempts. Last error: ${lastErr?.message || 'Unknown error'}`;
    if (!this.opts.quiet) console.error(`[Scraper] ${msg}`);
    const err = new Error(msg);
    this.onError(err);
    throw err;
  }

  private async navigate(attempt: number) {
    if (!this.page) throw new Error('No page');
    const opts = attempt === 1
      ? ({ waitUntil: 'domcontentloaded', timeout: 30000 } as const)
      : attempt === 2
      ? ({ waitUntil: 'load', timeout: 60000 } as const)
      : ({ waitUntil: 'networkidle2', timeout: 90000 } as const);
    try {
      await this.page.goto(this.chatUrl, opts);
    } catch (e) {
      try {
        const title = await this.page.title();
        const url = this.page.url();
        if (title && (title.includes('Live Chat') || title.includes('YouTube')) && url.includes('youtube.com')) {
          return;
        }
      } catch {}
      throw e;
    }
  }

  private async waitForChat() {
    if (!this.page) throw new Error('No page');
    const selectors = [
      'yt-live-chat-text-message-renderer',
      '[data-test-id="chat-message"]',
      'yt-live-chat-item-list-renderer',
      '#chat-messages',
      '#items'
    ];
    const start = Date.now();
    const max = 60000;
    while (Date.now() - start < max) {
      for (const sel of selectors) {
        try { await this.page.waitForSelector(sel, { timeout: 2000 }); return; } catch {}
      }
      await new Promise(r => setTimeout(r, 2000));
    }
    try {
      const title = await this.page.title();
      const bodyText = await this.page.evaluate(() => document.body.innerText);
      if (title.includes('YouTube') || bodyText.includes('Live Chat') || bodyText.includes('YouTube')) return;
    } catch {}
    throw new Error('Chat elements not found after waiting 60 seconds');
  }

  private startPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(async () => {
      if (!this.isRunning || !this.page) return;
      try {
        const messages = await this.page.evaluate(() => {
          function cyrb53(str: string, seed = 0) {
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
          function detectYouTubeUserRoles(messageElement: Element) {
            try {
              const badgeSelectors = ['#chat-badges yt-live-chat-author-badge-renderer', '#chip-badges yt-live-chat-author-badge-renderer', '#author-badges yt-live-chat-author-badge-renderer'];
              const badgeElements = badgeSelectors.flatMap(sel => Array.from(messageElement.querySelectorAll(sel)));
              const badgeText = badgeElements.map(b => (b.getAttribute('aria-label') || b.getAttribute('tooltip') || b.textContent || '')).join(' ').toLowerCase();
              const authorType = (messageElement.getAttribute('author-type') || '').toLowerCase();
              const elementClasses = (messageElement.className || '').toString().toLowerCase();
              const nameElement = messageElement.querySelector('#author-name') as HTMLElement | null;
              const nameClasses = (nameElement?.className || '').toString().toLowerCase();
              const isOwner = authorType === 'owner' || elementClasses.includes('author-is-owner') || /owner|channel owner/.test(badgeText) || nameClasses.includes('owner');
              const isModerator = authorType === 'moderator' || elementClasses.includes('moderator') || /moderator/.test(badgeText) || nameClasses.includes('moderator');
              const isMember = authorType === 'member' || /member/.test(badgeText) || nameClasses.includes('member');
              const isVerified = /verified|official artist/.test(badgeText) || nameClasses.includes('verified') || elementClasses.includes('verified');
              return { owner: isOwner, mod: isModerator, verified: isVerified, member: isMember };
            } catch { return { owner: false, mod: false, verified: false, member: false }; }
          }
          function parseSrcSet(srcset?: string | null) {
            if (!srcset) return '';
            const first = String(srcset).split(',')[0].trim();
            return first.split(' ')[0].trim();
          }
          function normalizeSize(url: string) { return (url || '').replace(/=s\d+-/g, '=s64-'); }
          function getAuthorAvatarUrl(root: Element) {
            const img = root.querySelector('#author-photo img#img') || root.querySelector('yt-live-chat-author-photo img#img') || root.querySelector('yt-img-shadow#author-photo img#img') as HTMLImageElement | null;
            if (!img) return '';
            const direct = img.getAttribute('src') || (img as any).src || '';
            const set = img.getAttribute('srcset');
            const chosen = direct && direct.startsWith('http') ? direct : parseSrcSet(set || '');
            return normalizeSize(chosen || direct || '');
          }
          function getAuthorBadges(root: Element) {
            const badges: any[] = [];
            const seen = new Set<string>();
            const scope = root.querySelector('yt-live-chat-author-chip') || root;
            const selectors = [
              '#chat-badges yt-live-chat-author-badge-renderer #image img',
              '#chip-badges yt-live-chat-author-badge-renderer #image img',
              '#prepend-chat-badges yt-live-chat-author-badge-renderer #image img',
              'yt-live-chat-author-badge-renderer #image img',
              'yt-live-chat-author-badge-renderer img'
            ];
            const normalizeBadgeSize = (url: string) => {
              if (!url) return '';
              try { return url.replace(/=s(\d+)([^&#?]*)/g, (_m, num: string, rest: string) => { const n = parseInt(num, 10); const target = n <= 24 ? 32 : n; return `=s${target}${rest || ''}`; }); } catch { return url; }
            };
            const imgs = selectors.flatMap(sel => Array.from(scope!.querySelectorAll(sel)));
            imgs.forEach(img => {
              try {
                const direct = (img as HTMLImageElement).getAttribute('src') || (img as any).src || '';
                const set = (img as HTMLImageElement).getAttribute('srcset') || '';
                const chosen = (direct && direct.startsWith('http')) ? direct : parseSrcSet(set);
                const url = normalizeBadgeSize(chosen || direct || '');
                if (!url || !/^https?:\/\//i.test(url)) return;
                if (seen.has(`url:${url}`)) return; seen.add(`url:${url}`);
                const alt = (img as HTMLImageElement).getAttribute('alt') || '';
                const type = (img.closest('yt-live-chat-author-badge-renderer') as HTMLElement | null)?.getAttribute('type') || '';
                badges.push({ url, alt, type });
              } catch {}
            });
            const rendererSelectors = [ '#chat-badges yt-live-chat-author-badge-renderer', '#chip-badges yt-live-chat-author-badge-renderer', '#prepend-chat-badges yt-live-chat-author-badge-renderer', 'yt-live-chat-author-badge-renderer' ];
            const renderers = rendererSelectors.flatMap(sel => Array.from(scope!.querySelectorAll(sel)));
            renderers.forEach(r => {
              try {
                if (r.querySelector('img')) return;
                const type = (r.getAttribute('type') || '').toLowerCase();
                const aria = (r.getAttribute('aria-label') || (r as any).getAttribute('shared-tooltip-text') || '').toLowerCase();
                let badgeType = type || (/verified/.test(aria) ? 'verified' : /moderator/.test(aria) ? 'moderator' : /owner|channel owner/.test(aria) ? 'owner' : '');
                if (!badgeType) return;
                let emoji = '';
                let alt = (r.getAttribute('aria-label') || (r as any).getAttribute('shared-tooltip-text') || badgeType).trim();
                if (badgeType === 'verified') emoji = '✔️'; else if (badgeType === 'moderator') emoji = '🔧'; else if (badgeType === 'owner') emoji = '👑';
                if (!emoji) return;
                const key = `emoji:${badgeType}:${emoji}`;
                if (seen.has(key)) return; seen.add(key);
                badges.push({ type: badgeType, alt, emoji });
              } catch {}
            });
            return badges;
          }
          function getSegmentsFromMessage(messageElement: Element) {
            const segments: any[] = [];
            const pushText = (text: string) => {
              if (!text) return;
              const last = segments[segments.length - 1];
              if (last && last.t === 'text') last.text += text; else segments.push({ t: 'text', text });
            };
            const parseSrcSet = (srcset?: string) => { if (!srcset) return ''; const first = String(srcset).split(',')[0].trim(); return first.split(' ')[0].trim(); };
            const normalizeSize = (url: string) => (url || '').replace(/=s\d+-/g, '=s64-');
            const walker = document.createTreeWalker(messageElement, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, null);
            let n = walker.currentNode as any;
            while (n) {
              if (n.nodeType === Node.TEXT_NODE) { pushText(n.nodeValue); }
              else if (n.nodeType === Node.ELEMENT_NODE) {
                const el = n as HTMLElement;
                if (el.tagName === 'IMG' || (el.className && String(el.className).toLowerCase().includes('emoji'))) {
                  const alt = el.getAttribute('alt') || '';
                  const src = el.getAttribute('src') || '';
                  const srcset = el.getAttribute('srcset') || '';
                  const chosen = src.startsWith('http') ? src : parseSrcSet(srcset);
                  const url = normalizeSize(chosen || src);
                  if (url) segments.push({ t: 'emote', url, alt });
                }
              }
              n = walker.nextNode();
            }
            return segments;
          }
          function hasCardWithin(el: Element) { try { return !!el.querySelector('#card'); } catch { return false; } }
          function normalizeAssetSize(url: string) { if (!url) return ''; try { return url.replace(/=s(\d+)([^&#?]*)/g, (_m, num: string, rest: string) => { const n = parseInt(num, 10); const target = n <= 64 ? 96 : n; return `=s${target}${rest || ''}`; }); } catch { return url; } }

          const out: any[] = []; const emitted = new Set<string>();
          const listRoot = document.querySelector('yt-live-chat-item-list-renderer #items') || document.querySelector('yt-live-chat-item-list-renderer') || document;
          const qsa = (sel: string) => Array.from(listRoot!.querySelectorAll(sel));
          const isInTicker = (el: Element) => { try { return !!el.closest('yt-live-chat-ticker-renderer'); } catch { return false; } };

          const messageElements = qsa('yt-live-chat-text-message-renderer');
          messageElements.forEach((element) => {
            try {
              if (isInTicker(element)) return;
              const authorElement = element.querySelector('#author-name') as HTMLElement | null;
              const messageElement = element.querySelector('#message') as HTMLElement | null;
              if (!authorElement || !messageElement) return;
              const rendererId = element.getAttribute('id') || '';
              const authorName = authorElement.textContent?.trim() || 'Unknown';
              const segments: any[] = getSegmentsFromMessage(messageElement);
              const messageText = (segments || []).filter((s: any) => s.t === 'text').map((s: any) => s.text).join('').trim();
              const avatarUrl = getAuthorAvatarUrl(element);
              const flags = detectYouTubeUserRoles(element);
              const badges = getAuthorBadges(element);
              if (!messageText && (!segments || segments.length === 0)) return;
              const hasCard = hasCardWithin(element);
              const stableKey = `text|${authorName}|${messageText}|${(segments||[]).filter((s: any)=>s.t==='emote').map((s: any)=>s.url).join(',')}`;
              const messageId = (rendererId && rendererId.length >= 10) ? rendererId : `h_${cyrb53(stableKey)}`;
              const payload = { id: messageId, author: { name: authorName, avatar: avatarUrl, flags, badges }, text: messageText, segments, timestamp: Date.now(), kind: 'text', hasCard };
              out.push(payload); emitted.add(messageId);
            } catch {}
          });

          const paidElements = qsa('yt-live-chat-paid-message-renderer');
          paidElements.forEach((element) => {
            try {
              if (isInTicker(element)) return;
              const authorElement = element.querySelector('#author-name') as HTMLElement | null;
              if (!authorElement) return;
              const messageElement = element.querySelector('#message') as HTMLElement | null;
              const rendererId = element.getAttribute('id') || '';
              const authorName = authorElement.textContent?.trim() || 'Unknown';
              const segments: any[] = messageElement ? getSegmentsFromMessage(messageElement) : [];
              const messageText = messageElement ? (segments || []).filter((s: any) => s.t === 'text').map((s: any) => s.text).join('').trim() : '';
              const avatarUrl = getAuthorAvatarUrl(element);
              const flags = detectYouTubeUserRoles(element);
              const badges = getAuthorBadges(element);
              const amountEl = element.querySelector('#purchase-amount') as HTMLElement | null;
              let amountDisplay = amountEl ? (amountEl.textContent || '').trim() : '';
              let color = '';
              try { const cs = getComputedStyle(element as HTMLElement); color = (cs.getPropertyValue('--yt-live-chat-paid-message-primary-color') || '').trim(); } catch {}
              const hasCard = hasCardWithin(element);
              const stableKey = `donation|${authorName}|${amountDisplay}|${messageText}`;
              const messageId = (rendererId && rendererId.length >= 10) ? rendererId : `h_${cyrb53(stableKey)}`;
              const payload = { id: messageId, author: { name: authorName, avatar: avatarUrl, flags, badges }, text: messageText, segments, timestamp: Date.now(), kind: 'donation', amountDisplay, color, hasCard };
              out.push(payload); emitted.add(messageId);
            } catch {}
          });

          const stickerElements = qsa('yt-live-chat-paid-sticker-renderer');
          stickerElements.forEach((element) => {
            try {
              if (isInTicker(element)) return;
              const authorElement = element.querySelector('#author-name') as HTMLElement | null;
              if (!authorElement) return;
              const rendererId = element.getAttribute('id') || '';
              const authorName = authorElement.textContent?.trim() || 'Unknown';
              const avatarUrl = getAuthorAvatarUrl(element);
              const flags = detectYouTubeUserRoles(element);
              const badges = getAuthorBadges(element);
              const amountEl = element.querySelector('#purchase-amount') as HTMLElement | null;
              const amountDisplay = amountEl ? (amountEl.textContent || '').trim() : '';
              let stickerUrl = '';
              try {
                const stickerImg = element.querySelector('#sticker img#img') || element.querySelector('#sticker img') || element.querySelector('img#img') as HTMLImageElement | null;
                const direct = stickerImg?.getAttribute('src') || (stickerImg as any)?.src || '';
                const srcset = stickerImg?.getAttribute('srcset') || '';
                const chosen = direct && direct.startsWith('http') ? direct : parseSrcSet(srcset);
                stickerUrl = normalizeAssetSize(chosen || direct || '');
              } catch {}
              const segments = stickerUrl ? [{ t: 'emote', url: stickerUrl, alt: 'Super Sticker' }] : [];
              const hasCard = hasCardWithin(element);
              const stableKey = `sticker|${authorName}|${amountDisplay}|${stickerUrl}`;
              const messageId = (rendererId && rendererId.length >= 10) ? rendererId : `h_${cyrb53(stableKey)}`;
              if (emitted.has(messageId)) return;
              const payload = { id: messageId, author: { name: authorName, avatar: avatarUrl, flags, badges }, text: '', segments, timestamp: Date.now(), kind: 'donation', amountDisplay, hasCard };
              out.push(payload); emitted.add(messageId);
            } catch {}
          });

          const memberJoinElements = qsa('yt-live-chat-membership-item-renderer');
          memberJoinElements.forEach((element) => {
            try {
              if (isInTicker(element)) return;
              const authorElement = element.querySelector('#author-name') as HTMLElement | null;
              if (!authorElement) return;
              const rendererId = element.getAttribute('id') || '';
              const authorName = authorElement.textContent?.trim() || 'Unknown';
              const messageElement = element.querySelector('#message') || element.querySelector('#header-subtext') || element.querySelector('#subtext') || element as Element;
              const segments: any[] = messageElement ? getSegmentsFromMessage(messageElement) : [];
              const messageText = (segments || []).filter((s: any) => s.t === 'text').map((s: any) => s.text).join('').trim() || 'New member!';
              const avatarUrl = getAuthorAvatarUrl(element);
              const flags = detectYouTubeUserRoles(element);
              const badges = getAuthorBadges(element);
              const hasCard = hasCardWithin(element);
              const stableKey = `member|${authorName}|${messageText}`;
              const messageId = (rendererId && rendererId.length >= 10) ? rendererId : `h_${cyrb53(stableKey)}`;
              out.push({ id: messageId, author: { name: authorName, avatar: avatarUrl, flags, badges }, text: messageText, segments, timestamp: Date.now(), kind: 'member', hasCard });
            } catch {}
          });

          const milestoneElements = qsa('yt-live-chat-membership-milestone-renderer, yt-live-chat-membership-milestone-chip-renderer');
          milestoneElements.forEach((element) => {
            try {
              if (isInTicker(element)) return;
              const authorElement = element.querySelector('#author-name') as HTMLElement | null;
              if (!authorElement) return;
              const rendererId = element.getAttribute('id') || '';
              const authorName = authorElement.textContent?.trim() || 'Unknown';
              const messageElement = element.querySelector('#message') || element as Element;
              const segments: any[] = getSegmentsFromMessage(messageElement);
              const messageText = (segments || []).filter((s: any) => s.t === 'text').map((s: any) => s.text).join('').trim() || 'Member milestone!';
              const avatarUrl = getAuthorAvatarUrl(element);
              const flags = detectYouTubeUserRoles(element);
              const badges = getAuthorBadges(element);
              const hasCard = hasCardWithin(element);
              const stableKey = `member-milestone|${authorName}|${messageText}`;
              const messageId = (rendererId && rendererId.length >= 10) ? rendererId : `h_${cyrb53(stableKey)}`;
              out.push({ id: messageId, author: { name: authorName, avatar: avatarUrl, flags, badges }, text: messageText, segments, timestamp: Date.now(), kind: 'member-milestone', hasCard });
            } catch {}
          });

          const giftSelectors = ['ytd-sponsorships-live-chat-header-renderer', 'yt-live-chat-sponsor-gift-purchase-announcement-renderer', 'yt-live-chat-gift-purchase-announcement-renderer'];
          const giftElements = giftSelectors.flatMap(sel => Array.from(document.querySelectorAll(sel)));
          giftElements.forEach((element) => {
            try {
              if (isInTicker(element)) return;
              const rendererId = element.getAttribute('id') || '';
              const authorName = ((element.querySelector('yt-live-chat-author-chip #author-name') as HTMLElement | null)?.textContent || (element.querySelector('#author-name') as HTMLElement | null)?.textContent || '').trim() || 'Unknown';
              const primaryText = (element.querySelector('#primary-text') as HTMLElement | null)?.textContent?.trim() || '';
              const text = primaryText || 'Gifted memberships';
              const avatarUrl = getAuthorAvatarUrl(element);
              const flags = detectYouTubeUserRoles(element);
              const badges = getAuthorBadges(element);
              const hasCard = true;
              const stableKey = `member-gift|${authorName}|${text}`;
              const messageId = (rendererId && rendererId.length >= 10) ? rendererId : `h_${cyrb53(stableKey)}`;
              if ((emitted as Set<string>).has(messageId)) return;
              out.push({ id: messageId, author: { name: authorName, avatar: avatarUrl, flags, badges }, text, segments: [], timestamp: Date.now(), kind: 'member-gift', hasCard });
              (emitted as Set<string>).add(messageId);
            } catch {}
          });

          return out;
        });

        for (const message of messages as any[]) {
          const hasText = typeof message.text === 'string' && message.text.trim().length > 0;
          const hasSegments = Array.isArray(message.segments) && message.segments.length > 0;
          const highPriority = !!message.hasCard || ['donation','member','member-milestone','member-gift'].includes(message.kind);
          if (!this.seenIds.has(message.id) && (hasText || hasSegments || highPriority)) {
            this.seenIds.add(message.id);
            const evt: ChatEvent = {
              id: message.id,
              author: message.author,
              text: message.text || '',
              segments: message.segments,
              kind: message.kind,
              ts: message.timestamp || Date.now(),
              amountDisplay: message.amountDisplay,
              color: message.color,
              hasCard: message.hasCard
            };
            this.onMessage(evt);
          }
        }
      } catch (err: any) {
        if (!this.opts.quiet) console.error('[Scraper] Error during polling:', err?.message || err);
        if ((err?.message || '').includes('Protocol error') || (err?.message || '').includes('Target closed')) {
          if (!this.opts.quiet) console.log('[Scraper] Browser connection lost, stopping...');
          await this.stop();
        }
      }
    }, this.opts.pollInterval);
  }

  async stop() {
    if (!this.isRunning) return;
    if (!this.opts.quiet) console.log('[Scraper] Stopping...');
    this.isRunning = false;
    this.onStatus({ status: 'stopping' });
    await this.cleanup();
    this.onStatus({ status: 'stopped' });
    if (!this.opts.quiet) console.log('[Scraper] Stopped');
  }

  private async cleanup() {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    if (this.page) { try { await this.page.close(); } catch {} this.page = null; }
    if (this.browser) { try { await this.browser.close(); } catch {} this.browser = null; }
  }
}

export default YouTubeChatScraper;
