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

      // Parse badges from a container element
      function parseBadges(container: Element) {
        const badges: any[] = [];
        const flags = { owner: false, mod: false, verified: false, member: false };
        const badgeButtons = container.querySelectorAll('[data-a-target="chat-badge"]');
        badgeButtons.forEach(badge => {
          const img = badge.querySelector('img.chat-badge, img') as HTMLImageElement | null;
          if (!img) return;
          const src = img.getAttribute('src') || '';
          const srcset = img.getAttribute('srcset');
          const url = getBestSrcFromSrcset(srcset, src);
          const ariaLabel = img.getAttribute('aria-label') || '';
          const altText = img.getAttribute('alt') || '';
          const alt = ariaLabel.replace(/\s*badge$/i, '').trim() || altText;
          const altLower = (ariaLabel || altText).toLowerCase();
          if (url) badges.push({ url, alt });
          if (altLower.includes('broadcaster')) flags.owner = true;
          if (altLower.includes('moderator') || altLower.includes('mod')) flags.mod = true;
          if (altLower.includes('verified') || altLower.includes('partner')) flags.verified = true;
          if (altLower.includes('subscriber') || altLower.includes('sub') || altLower.includes('month')) flags.member = true;
          if (altLower.includes('vip')) flags.member = true;
          if (altLower.includes('founder')) flags.member = true;
        });
        return { badges, flags };
      }

      // Parse message segments (text and emotes) from a container
      function parseMessageSegments(container: Element | null) {
        const segments: any[] = [];
        if (!container) return segments;
        const processNode = (node: Node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            const text = node.nodeValue || '';
            // Keep text if it has any content (including whitespace-only for spacing)
            if (text) {
              const last = segments[segments.length - 1];
              if (last && last.t === 'text') last.text += text;
              else segments.push({ t: 'text', text });
            }
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            if (el.tagName === 'IMG') {
              const classes = el.className.toLowerCase();
              if (classes.includes('emote') || classes.includes('emoticon') || classes.includes('chat-image')) {
                const src = el.getAttribute('src') || '';
                const srcset = el.getAttribute('srcset');
                const url = getBestSrcFromSrcset(srcset, src);
                const alt = el.getAttribute('alt') || '';
                if (url) segments.push({ t: 'emote', url, alt });
                return;
              }
            }
            if (el.classList.contains('text-fragment') || el.getAttribute('data-a-target') === 'chat-message-text') {
              const text = el.textContent || '';
              // Keep text if it has any content (including whitespace-only for spacing)
              if (text) {
                const last = segments[segments.length - 1];
                if (last && last.t === 'text') last.text += text;
                else segments.push({ t: 'text', text });
              }
              return;
            }
            el.childNodes.forEach(child => processNode(child));
          }
        };
        container.childNodes.forEach(child => processNode(child));
        return segments;
      }

      const out: any[] = [];
      const visibleIds: string[] = [];

      // ─────────────────────────────────────────────────────────────────────
      // Regular chat messages
      // ─────────────────────────────────────────────────────────────────────
      const messageElements = document.querySelectorAll('[data-a-target="chat-line-message"]');

      messageElements.forEach((element) => {
        try {
          // Skip if this is part of a subscription notice (handled separately)
          if (element.closest('[data-test-selector="user-notice-line"]')) return;

          const msgId = element.getAttribute('data-a-id') || '';
          const usernameEl = element.querySelector('[data-a-target="chat-message-username"]') as HTMLElement | null;
          const authorName = usernameEl?.textContent?.trim() || element.getAttribute('data-a-user') || 'Unknown';
          
          // Extract username color from inline style
          let nameColor = '';
          if (usernameEl) {
            const style = usernameEl.getAttribute('style') || '';
            const colorMatch = style.match(/color:\s*([^;]+)/i);
            if (colorMatch) nameColor = colorMatch[1].trim();
          }
          
          // Check for reply context
          // Reply info is in a <p> with "Replying to @username: message preview"
          // The title attribute contains the full original message
          let replyTo: { username: string; messagePreview: string } | undefined;
          const replyContainer = element.closest('.chat-line__message')?.querySelector('p[title]') as HTMLElement | null;
          if (replyContainer) {
            const replyText = replyContainer.textContent?.trim() || '';
            const titleText = replyContainer.getAttribute('title') || '';
            // Parse "Replying to @username: message"
            const match = replyText.match(/^Replying to @([^:]+):\s*/i);
            if (match) {
              const username = match[1].trim();
              // Use title attribute for full message if available, otherwise extract from text
              const messagePreview = titleText || replyText.replace(match[0], '').trim();
              if (username && messagePreview) {
                replyTo = { username, messagePreview };
              }
            }
          }
          
          const messageContainer = element.querySelector('[data-a-target="chat-line-message-body"]') as HTMLElement | null;
          const segments = parseMessageSegments(messageContainer);
          const messageText = segments.filter(s => s.t === 'text').map(s => s.text).join('').trim();
          
          if (!messageText && segments.length === 0) return;

          const stableKey = `twitch|${authorName}|${messageText}|${segments.filter(s => s.t === 'emote').map(s => s.url).join(',')}`;
          const messageId = msgId || `tw_${cyrb53(stableKey)}`;
          visibleIds.push(messageId);

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

      // ─────────────────────────────────────────────────────────────────────
      // Subscription / Resub / Gift sub notices
      // ─────────────────────────────────────────────────────────────────────
      const userNotices = document.querySelectorAll('[data-test-selector="user-notice-line"]');

      userNotices.forEach((notice) => {
        try {
          // Get the system message text (subscription info)
          // For regular subs: the <p> contains the full message
          // For gift subs: the message is split across <p> (username) and sibling <span> (details)
          let systemMessage = '';
          
          // Try to get full text from the message container first
          const giftContainer = notice.querySelector('.mystery-gift-theme__displayname')?.parentElement;
          if (giftContainer) {
            // Gift sub: combine all text from the container
            systemMessage = giftContainer.textContent?.trim() || '';
          } else {
            // Regular sub: get from the <p> element
            const systemTextEl = notice.querySelector('p') as HTMLElement | null;
            systemMessage = systemTextEl?.textContent?.trim() || '';
          }
          
          if (!systemMessage) return;

          // Determine subscription type from system message
          let kind = 'sub';
          const sysLower = systemMessage.toLowerCase();
          if (sysLower.includes('gifted') || sysLower.includes('gift')) {
            kind = 'sub-gift';
          }

          // Extract username from system message or nested chat line
          let authorName = '';
          let nameColor = '';
          
          // Try to get from the chatter-name span in system message
          const chatterNameEl = notice.querySelector('.chatter-name span, .chatter-name') as HTMLElement | null;
          if (chatterNameEl) {
            authorName = chatterNameEl.textContent?.trim() || '';
          }

          // Look for custom message in the nested chat line
          const customMsgContainer = notice.querySelector('[data-a-target="chat-resubscription-message__custom-message"], [data-a-target*="custom-message"]');
          const chatLine = customMsgContainer?.querySelector('[data-a-target="chat-line-message"]') || customMsgContainer;
          
          let segments: any[] = [];
          let badges: any[] = [];
          let flags = { owner: false, mod: false, verified: false, member: true }; // Subs are always members
          
          if (chatLine) {
            // Get author info from the chat line if not already found
            if (!authorName) {
              const usernameEl = chatLine.querySelector('[data-a-target="chat-message-username"]') as HTMLElement | null;
              authorName = usernameEl?.textContent?.trim() || chatLine.getAttribute('data-a-user') || '';
            }
            
            // Get username color
            const usernameEl = chatLine.querySelector('[data-a-target="chat-message-username"]') as HTMLElement | null;
            if (usernameEl) {
              const style = usernameEl.getAttribute('style') || '';
              const colorMatch = style.match(/color:\s*([^;]+)/i);
              if (colorMatch) nameColor = colorMatch[1].trim();
            }
            
            // Parse badges from chat line
            const badgeResult = parseBadges(chatLine as Element);
            badges = badgeResult.badges;
            flags = { ...flags, ...badgeResult.flags };
            
            // Parse custom message content
            const msgBody = chatLine.querySelector('[data-a-target="chat-line-message-body"]') as HTMLElement | null;
            segments = parseMessageSegments(msgBody);
          }
          
          if (!authorName) {
            // Fallback: try to extract from system message (e.g., "username Subscribed...")
            const match = systemMessage.match(/^(\S+)\s+(subscribed|gifted)/i);
            if (match) authorName = match[1];
          }
          
          if (!authorName) return; // Can't process without a username

          // Strip the username from the beginning of systemMessage since we show it in the header
          let cleanSystemMessage = systemMessage;
          if (authorName && systemMessage.startsWith(authorName)) {
            cleanSystemMessage = systemMessage.slice(authorName.length).trim();
          }

          const messageText = segments.filter(s => s.t === 'text').map(s => s.text).join('').trim();
          const stableKey = `twitch-sub|${authorName}|${systemMessage}|${messageText}`;
          const messageId = `tw_sub_${cyrb53(stableKey)}`;
          visibleIds.push(messageId);

          const payload = {
            id: messageId,
            author: { name: authorName, avatar: '', flags, badges, nameColor: nameColor || undefined, badgePosition: 'left' },
            text: messageText,
            segments: segments.length > 0 ? segments : (messageText ? [{ t: 'text', text: messageText }] : []),
            timestamp: Date.now(),
            kind,
            systemMessage: cleanSystemMessage
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
          systemMessage: message.systemMessage,
          replyTo: message.replyTo
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
