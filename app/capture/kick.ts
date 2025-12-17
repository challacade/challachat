/* eslint-disable no-console */
import { ChatEvent, CaptureOptions } from './types';
import { BaseChatCapture } from './base';

/**
 * KickChatCapture - Captures chat messages from a Kick channel.
 * Extends BaseChatCapture for shared browser/polling logic.
 */
export class KickChatCapture extends BaseChatCapture {
  private channel: string;
  protected readonly logPrefix = 'Kick';
  protected readonly chatUrl: string;

  constructor(channel: string, options: CaptureOptions = {}) {
    super(options);
    this.channel = channel.toLowerCase();
    this.chatUrl = `https://kick.com/popout/${this.channel}/chat`;
  }

  protected get viewport() {
    return { width: 400, height: 600 };
  }

  protected getStartingStatus() {
    return { status: 'starting', channel: this.channel, platform: 'kick' };
  }

  protected getActiveStatus() {
    return { status: 'active', channel: this.channel, platform: 'kick' };
  }

  protected getChatSelectors(): string[] {
    return [
      '[data-index]',  // Chat messages have data-index attribute
      '.overflow-y-scroll',  // Chat container
      '[class*="chat"]'
    ];
  }

  protected async isValidPage(): Promise<boolean> {
    if (!this.page) return false;
    try {
      const url = this.page.url();
      const title = await this.page.title();
      return url.includes('kick.com') || title.toLowerCase().includes('kick');
    } catch {
      return false;
    }
  }

  async stop() {
    if (!this.isRunning) return;
    this.log('Stopping...');
    this.isRunning = false;
    this.emitStatus({ status: 'stopping', platform: 'kick' });
    await this.cleanup();
    this.emitStatus({ status: 'stopped', platform: 'kick' });
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

      // Parse badges from a message container (inline SVGs)
      function parseBadges(container: Element) {
        const badges: any[] = [];
        const flags = { owner: false, mod: false, verified: false, member: false };
        
        // Kick uses inline SVGs for badges - find badge containers
        const badgeContainers = container.querySelectorAll('.inline-flex.shrink-0.items-center svg');
        badgeContainers.forEach(svg => {
          // Convert SVG to data URL for display
          try {
            const svgClone = svg.cloneNode(true) as SVGElement;
            // Ensure proper sizing
            svgClone.setAttribute('width', '18');
            svgClone.setAttribute('height', '18');
            const svgString = new XMLSerializer().serializeToString(svgClone);
            const dataUrl = `data:image/svg+xml;base64,${btoa(svgString)}`;
            badges.push({ url: dataUrl, alt: 'badge' });
          } catch {}
        });
        
        // Also check for badge images
        const badgeImages = container.querySelectorAll('.inline-flex.shrink-0.items-center img');
        badgeImages.forEach(img => {
          const src = (img as HTMLImageElement).src || '';
          if (src) {
            badges.push({ url: src, alt: 'badge' });
          }
        });
        
        return { badges, flags };
      }

      // Parse message segments (text and emotes) from message content
      function parseMessageSegments(container: Element | null) {
        const segments: any[] = [];
        if (!container) return segments;
        
        const processNode = (node: Node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            const text = node.nodeValue || '';
            if (text) {
              const last = segments[segments.length - 1];
              if (last && last.t === 'text') last.text += text;
              else segments.push({ t: 'text', text });
            }
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            
            // Check for emote images
            if (el.tagName === 'IMG') {
              const src = el.getAttribute('src') || '';
              const alt = el.getAttribute('alt') || '';
              if (src) {
                segments.push({ t: 'emote', url: src, alt });
                return;
              }
            }
            
            // Skip badge containers and timestamp spans
            if (el.classList.contains('inline-flex') && el.querySelector('svg')) return;
            if (el.style.display === 'var(--chatroom-timestamps-display)') return;
            
            // Process children
            el.childNodes.forEach(child => processNode(child));
          }
        };
        
        container.childNodes.forEach(child => processNode(child));
        return segments;
      }

      const out: any[] = [];
      const visibleIds: string[] = [];

      // Find all chat message elements (they have data-index attribute)
      const messageElements = document.querySelectorAll('[data-index]');

      messageElements.forEach((element) => {
        try {
          const dataIndex = element.getAttribute('data-index') || '';
          if (!dataIndex) return;
          
          // Find the username button with title attribute
          const usernameEl = element.querySelector('button.inline.font-bold[title]') as HTMLElement | null;
          if (!usernameEl) return;
          
          const authorName = usernameEl.getAttribute('title') || usernameEl.textContent?.trim() || 'Unknown';
          
          // Extract username color from inline style
          let nameColor = '';
          const style = usernameEl.getAttribute('style') || '';
          const colorMatch = style.match(/color:\s*([^;]+)/i);
          if (colorMatch) nameColor = colorMatch[1].trim();
          
          // Check for reply context
          let replyTo: { username: string; messagePreview: string } | undefined;
          const replyContainer = element.querySelector('.text-xs.font-medium') as HTMLElement | null;
          if (replyContainer) {
            const replyText = replyContainer.textContent?.trim() || '';
            // Parse "Replying to username: message preview"
            const match = replyText.match(/Replying to\s+([^:]+):\s*(.+)/i);
            if (match) {
              const username = match[1].trim();
              const messagePreview = match[2].trim();
              if (username && messagePreview) {
                replyTo = { username, messagePreview };
              }
            }
          }
          
          // Find the message content span (font-normal leading-[1.55])
          const messageContainer = element.querySelector('span.font-normal.leading-\\[1\\.55\\]') as HTMLElement | null;
          // Fallback: look for the last span that contains the message text
          const fallbackContainer = messageContainer || element.querySelector('.break-words > span:last-child') as HTMLElement | null;
          
          const segments = parseMessageSegments(fallbackContainer);
          const messageText = segments.filter(s => s.t === 'text').map(s => s.text).join('').trim();
          
          if (!messageText && segments.length === 0) return;

          const stableKey = `kick|${authorName}|${messageText}|${segments.filter(s => s.t === 'emote').map(s => s.url).join(',')}`;
          const messageId = `kick_${dataIndex}_${cyrb53(stableKey)}`;
          visibleIds.push(messageId);

          // Parse badges from the message row
          const { badges, flags } = parseBadges(element);

          const payload = {
            id: messageId,
            author: { name: authorName, avatar: '', flags, badges, nameColor: nameColor || undefined, badgePosition: 'left' },
            text: messageText,
            segments: segments.length > 0 ? segments : [{ t: 'text', text: messageText }],
            timestamp: Date.now(),
            kind: 'text',
            replyTo
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
      const isHighPriority = ['sub', 'sub-gift', 'cheer', 'donation'].includes(message.kind);
      if (!this.seenIds.has(message.id) && (hasText || hasSegments || isHighPriority)) {
        this.seenIds.add(message.id);
        const evt: ChatEvent = {
          id: message.id,
          author: message.author,
          text: message.text || '',
          segments: message.segments,
          kind: message.kind || 'text',
          ts: message.timestamp || Date.now(),
          replyTo: message.replyTo
        };
        this.callbacks.onMessage(evt);
      }
    }

    // Deletion detection - Kick uses data-index which changes, so we track by generated IDs
    const knownDomIds = Array.from(this.seenIds).filter(id => !id.startsWith('kick_'));
    for (const id of knownDomIds) {
      if (!visibleRendererIds.has(id)) {
        this.callbacks.onDelete(id);
        this.seenIds.delete(id);
      }
    }
  }
}

export default KickChatCapture;
