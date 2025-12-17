/* eslint-disable no-console */
import { ChatEvent, CaptureOptions } from './types';
import { BaseChatCapture } from './base';

/**
 * TwitchChatCapture - Captures chat messages from a Twitch channel.
 * Extends BaseChatCapture for shared browser/polling logic.
 */
export class TwitchChatCapture extends BaseChatCapture {
  private channel: string;
  protected readonly logPrefix = 'Twitch';
  protected readonly chatUrl: string;

  constructor(channel: string, options: CaptureOptions = {}) {
    super(options);
    this.channel = channel.toLowerCase();
    this.chatUrl = `https://www.twitch.tv/popout/${this.channel}/chat?popout=`;
  }

  protected get viewport() {
    return { width: 400, height: 600 };
  }

  protected getStartingStatus() {
    return { status: 'starting', channel: this.channel, platform: 'twitch' };
  }

  protected getActiveStatus() {
    return { status: 'active', channel: this.channel, platform: 'twitch' };
  }

  protected getChatSelectors(): string[] {
    return [
      '[data-test-selector="chat-scrollable-area__message-container"]',
      '.chat-scrollable-area__message-container',
      '.chat-list--default',
      '.chat-list',
      '[data-a-target="chat-scroller"]'
    ];
  }

  protected async isValidPage(): Promise<boolean> {
    if (!this.page) return false;
    try {
      const url = this.page.url();
      const title = await this.page.title();
      return url.includes('twitch.tv') || title.toLowerCase().includes('twitch');
    } catch {
      return false;
    }
  }

  async stop() {
    if (!this.isRunning) return;
    this.log('Stopping...');
    this.isRunning = false;
    this.emitStatus({ status: 'stopping', platform: 'twitch' });
    await this.cleanup();
    this.emitStatus({ status: 'stopped', platform: 'twitch' });
    this.log('Stopped');
  }

  protected async pollMessages(): Promise<void> {
    if (!this.page) return;
    const result = await this.page.evaluate(() => {
      // Hash function for stable IDs
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

      // Extract best URL from srcset (prefer 2x or highest available)
      function getBestSrcFromSrcset(srcset: string | null, fallbackSrc: string): string {
        if (!srcset) return fallbackSrc;
        try {
          const parts = srcset.split(',').map(s => s.trim());
          // Look for 2x first (good balance of quality/size), then 4x, then 1x
          for (const target of ['2x', '4x', '1x']) {
            const match = parts.find(p => p.endsWith(target));
            if (match) return match.split(' ')[0];
          }
        } catch {}
        return fallbackSrc;
      }

      const out: any[] = [];
      const visibleIds: string[] = [];

      // Find chat message containers
      const messageElements = document.querySelectorAll('[data-a-target="chat-line-message"]');

      messageElements.forEach((element) => {
        try {
          // Get message ID - try data-a-id first, fall back to generating one
          const msgId = element.getAttribute('data-a-id') || '';
          
          // Get username from the display name element
          const usernameEl = element.querySelector('[data-a-target="chat-message-username"]') as HTMLElement | null;
          const authorName = usernameEl?.textContent?.trim() || element.getAttribute('data-a-user') || 'Unknown';
          
          // Extract username color from inline style
          let nameColor = '';
          if (usernameEl) {
            const style = usernameEl.getAttribute('style') || '';
            const colorMatch = style.match(/color:\s*([^;]+)/i);
            if (colorMatch) nameColor = colorMatch[1].trim();
          }
          
          // Get message body container
          const messageContainer = element.querySelector('[data-a-target="chat-line-message-body"]') as HTMLElement | null;

          // Parse message segments (text and emotes)
          const segments: any[] = [];
          if (messageContainer) {
            // Walk through all child nodes to preserve order of text and emotes
            const processNode = (node: Node) => {
              if (node.nodeType === Node.TEXT_NODE) {
                const text = node.nodeValue || '';
                if (text.trim()) {
                  const last = segments[segments.length - 1];
                  if (last && last.t === 'text') last.text += text;
                  else segments.push({ t: 'text', text });
                }
              } else if (node.nodeType === Node.ELEMENT_NODE) {
                const el = node as HTMLElement;
                // Check for emote images (class can be chat-image, emote, emoticon, etc.)
                if (el.tagName === 'IMG') {
                  const classes = el.className.toLowerCase();
                  if (classes.includes('emote') || classes.includes('emoticon') || classes.includes('chat-image')) {
                    const src = el.getAttribute('src') || '';
                    const srcset = el.getAttribute('srcset');
                    const url = getBestSrcFromSrcset(srcset, src);
                    const alt = el.getAttribute('alt') || '';
                    if (url) segments.push({ t: 'emote', url, alt });
                    return; // Don't recurse into img
                  }
                }
                // Check for text fragments
                if (el.classList.contains('text-fragment') || el.getAttribute('data-a-target') === 'chat-message-text') {
                  const text = el.textContent || '';
                  if (text.trim()) {
                    const last = segments[segments.length - 1];
                    if (last && last.t === 'text') last.text += text;
                    else segments.push({ t: 'text', text });
                  }
                  return; // Don't recurse further
                }
                // Recurse into child nodes
                el.childNodes.forEach(child => processNode(child));
              }
            };
            messageContainer.childNodes.forEach(child => processNode(child));
          }

          // Build plain text from segments
          const messageText = segments.filter(s => s.t === 'text').map(s => s.text).join('').trim();
          
          if (!messageText && segments.length === 0) return;

          // Generate stable ID
          const stableKey = `twitch|${authorName}|${messageText}|${segments.filter(s => s.t === 'emote').map(s => s.url).join(',')}`;
          const messageId = msgId || `tw_${cyrb53(stableKey)}`;
          visibleIds.push(messageId);

          // Parse badges - look for badge buttons with images
          const badgeButtons = element.querySelectorAll('[data-a-target="chat-badge"]');
          const badges: any[] = [];
          const flags = { owner: false, mod: false, verified: false, member: false };

          badgeButtons.forEach(badge => {
            const img = badge.querySelector('img.chat-badge, img') as HTMLImageElement | null;
            if (!img) return;
            
            // Get the best quality badge image
            const src = img.getAttribute('src') || '';
            const srcset = img.getAttribute('srcset');
            const url = getBestSrcFromSrcset(srcset, src);
            
            // Use aria-label for best alt text, fall back to alt attribute
            const ariaLabel = img.getAttribute('aria-label') || '';
            const altText = img.getAttribute('alt') || '';
            const alt = ariaLabel.replace(/\s*badge$/i, '').trim() || altText;
            const altLower = (ariaLabel || altText).toLowerCase();
            
            if (url) badges.push({ url, alt });
            
            // Set flags based on badge type
            if (altLower.includes('broadcaster')) flags.owner = true;
            if (altLower.includes('moderator') || altLower.includes('mod')) flags.mod = true;
            if (altLower.includes('verified') || altLower.includes('partner')) flags.verified = true;
            if (altLower.includes('subscriber') || altLower.includes('sub') || altLower.includes('month')) flags.member = true;
            if (altLower.includes('vip')) flags.member = true;
            if (altLower.includes('founder')) flags.member = true;
          });

          const payload = {
            id: messageId,
            author: { name: authorName, avatar: '', flags, badges, nameColor: nameColor || undefined },
            text: messageText,
            segments: segments.length > 0 ? segments : [{ t: 'text', text: messageText }],
            timestamp: Date.now(),
            kind: 'text'
          };
          out.push(payload);
        } catch {}
      });

      return { messages: out, visibleIds };
    });

    const messages = (result as any)?.messages || [];
    const visibleRendererIds: Set<string> = new Set((result as any)?.visibleIds || []);

    for (const message of messages as any[]) {
      const hasText = typeof message.text === 'string' && message.text.trim().length > 0;
      const hasSegments = Array.isArray(message.segments) && message.segments.length > 0;
      if (!this.seenIds.has(message.id) && (hasText || hasSegments)) {
        this.seenIds.add(message.id);
        const evt: ChatEvent = {
          id: message.id,
          author: message.author,
          text: message.text || '',
          segments: message.segments,
          kind: message.kind || 'text',
          ts: message.timestamp || Date.now()
        };
        this.callbacks.onMessage(evt);
      }
    }

    // Deletion detection
    const knownDomIds = Array.from(this.seenIds).filter(id => !id.startsWith('tw_'));
    for (const id of knownDomIds) {
      if (!visibleRendererIds.has(id)) {
        this.callbacks.onDelete(id);
        this.seenIds.delete(id);
      }
    }
  }
}

export default TwitchChatCapture;
