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

      const out: any[] = [];
      const visibleIds: string[] = [];

      // Find chat message containers
      const messageElements = document.querySelectorAll('[data-a-target="chat-line-message"]');

      messageElements.forEach((element) => {
        try {
          const msgId = element.getAttribute('data-a-id') || '';
          const usernameEl = element.querySelector('[data-a-target="chat-message-username"]') as HTMLElement | null;
          const authorName = usernameEl?.textContent?.trim() || 'Unknown';
          const messageContainer = element.querySelector('[data-a-target="chat-line-message-body"]') as HTMLElement | null;
          const messageText = messageContainer?.textContent?.trim() || '';

          // Parse segments
          const segments: any[] = [];
          if (messageContainer) {
            const walker = document.createTreeWalker(messageContainer, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, null);
            let n = walker.currentNode as any;
            while (n) {
              if (n.nodeType === Node.TEXT_NODE) {
                const text = n.nodeValue?.trim();
                if (text) {
                  const last = segments[segments.length - 1];
                  if (last && last.t === 'text') last.text += ' ' + text;
                  else segments.push({ t: 'text', text });
                }
              } else if (n.nodeType === Node.ELEMENT_NODE) {
                const el = n as HTMLElement;
                if (el.tagName === 'IMG' && el.classList.contains('chat-image')) {
                  const src = el.getAttribute('src') || '';
                  const alt = el.getAttribute('alt') || '';
                  if (src) segments.push({ t: 'emote', url: src, alt });
                }
              }
              n = walker.nextNode();
            }
          }

          if (!messageText && segments.length === 0) return;

          const stableKey = `twitch|${authorName}|${messageText}`;
          const messageId = msgId || `tw_${cyrb53(stableKey)}`;
          visibleIds.push(messageId);

          // Parse badges
          const badgeElements = element.querySelectorAll('[data-a-target="chat-badge"]');
          const badges: any[] = [];
          const flags = { owner: false, mod: false, verified: false, member: false };

          badgeElements.forEach(badge => {
            const img = badge.querySelector('img');
            const alt = img?.getAttribute('alt')?.toLowerCase() || '';
            const src = img?.getAttribute('src') || '';
            if (src) badges.push({ url: src, alt: img?.getAttribute('alt') || '' });
            if (alt.includes('broadcaster')) flags.owner = true;
            if (alt.includes('moderator')) flags.mod = true;
            if (alt.includes('verified')) flags.verified = true;
            if (alt.includes('subscriber') || alt.includes('sub')) flags.member = true;
            if (alt.includes('vip')) flags.member = true;
          });

          const payload = {
            id: messageId,
            author: { name: authorName, avatar: '', flags, badges },
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
