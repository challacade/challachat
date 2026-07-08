/* eslint-disable no-console */
import { CaptureOptions } from './types';
import { BaseChatCapture } from './base';
import type { BrowserPoolProfile } from './browserPool';

/**
 * KickChatCapture - Captures chat messages from a Kick channel.
 * Extends BaseChatCapture for shared browser/polling logic.
 */
export class KickChatCapture extends BaseChatCapture {
  private channel: string;
  protected readonly logPrefix = 'Kick';
  protected readonly chatUrl: string;
  protected readonly hashPrefix = 'kick_';
  protected readonly platformDomain = 'kick.com';
  protected readonly platformName = 'kick';
  protected readonly highPriorityKinds = ['sub', 'sub-gift', 'cheer', 'donation', 'redemption'];

  constructor(channel: string, options: CaptureOptions = {}) {
    super(options);
    this.channel = channel.toLowerCase();
    this.chatUrl = `https://kick.com/popout/${this.channel}/chat`;
  }

  protected get viewport() {
    return { width: 400, height: 600 };
  }

  protected get browserPoolProfile(): BrowserPoolProfile {
    // Kick blocks the normal headless capture profile. The compatible profile
    // uses a real minimized/offscreen browser with a fresh temp profile.
    return 'compatible';
  }

  protected get shouldInterceptRequests(): boolean {
    // Avoid touching Kick's document request. Request interception caused edge
    // failures while the same endpoint worked in a regular browser.
    return false;
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

  protected async pollMessages(): Promise<void> {
    if (!this.page) return;
    const result = await this.page.evaluate(() => {
      const cyrb53 = (window as any).__cyrb53;

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

      function parseTextRowFallback(element: Element) {
        // Current Kick rows may be plain text, e.g. "11:17 PMusername: message",
        // with no button[title] username element. Keep this fallback before
        // treating rows without the old username selector as non-messages.
        const rawText = (element.textContent || '').replace(/\u00a0/g, ' ').trim();
        if (!rawText || /^new messages$/i.test(rawText) || /deleted by a moderator/i.test(rawText)) return null;

        const match = rawText.match(/^(?:\d{1,2}:\d{2}\s*(?:AM|PM)?)\s*([^:]{1,80}):\s*(.*)$/i);
        if (!match) return null;

        const authorName = match[1].trim();
        const messageText = match[2].trim();
        if (!authorName || !messageText) return null;

        let nameColor = '';
        const authorCandidates = element.querySelectorAll('button.inline.font-bold, button.font-bold, span.font-bold, [style*="color"]');
        authorCandidates.forEach((candidate) => {
          if (nameColor) return;
          const candidateElement = candidate as HTMLElement;
          const candidateText = (candidateElement.textContent || '').trim();
          if (candidateText !== authorName) return;
          const style = candidateElement.getAttribute('style') || '';
          const colorMatch = style.match(/color:\s*([^;]+)/i);
          if (colorMatch) nameColor = colorMatch[1].trim();
          if (!nameColor) {
            try { nameColor = getComputedStyle(candidateElement).color || ''; } catch {}
          }
        });

        const segments: any[] = [{ t: 'text', text: messageText }];
        element.querySelectorAll('img[src], img[srcset]').forEach((img) => {
          if (img.closest('.inline-flex.shrink-0.items-center')) return;
          const image = img as HTMLImageElement;
          const src = image.getAttribute('src') || image.src || '';
          const alt = image.getAttribute('alt') || '';
          if (src) segments.push({ t: 'emote', url: src, alt });
        });

        const { badges, flags } = parseBadges(element);
        return { authorName, messageText, segments, nameColor, badges, flags };
      }

      const out: any[] = [];
      const visibleIds: string[] = [];

      // Find all chat message elements (they have data-index attribute)
      const messageElements = document.querySelectorAll('[data-index]');

      messageElements.forEach((element) => {
        try {
          const dataIndex = element.getAttribute('data-index') || '';
          if (!dataIndex) return;
          
          // Check for redemption or subscription message using structural indicators (language-agnostic)
          const highlightContainer = element.querySelector('.border-l-4') as HTMLElement | null;
          if (highlightContainer) {
            const hasBorderColor = (highlightContainer.getAttribute('style') || '').includes('border-color');
            const hasSvgIcon = !!highlightContainer.querySelector(':scope > svg, .shrink-0 > svg');
            
            if (hasBorderColor && hasSvgIcon) {
              // Extract border color for the highlight
              const borderStyle = highlightContainer.getAttribute('style') || '';
              const borderColorMatch = borderStyle.match(/border-color:\s*([^;]+)/i);
              const highlightColor = borderColorMatch ? borderColorMatch[1].trim() : '';
              
              // Check for GIFT SUBSCRIPTION: button is sibling of span.text-surface-onSurfaceSecondary
              // Structure: div.flex-col > button + span.text-surface-onSurfaceSecondary
              const flexColContainer = highlightContainer.querySelector('.flex.flex-col, div.flex-col') as HTMLElement | null;
              const giftUsernameBtn = flexColContainer?.querySelector(':scope > button.font-bold') as HTMLElement | null;
              const giftInfoSpan = flexColContainer?.querySelector(':scope > span.text-surface-onSurfaceSecondary') as HTMLElement | null;
              
              if (giftUsernameBtn && giftInfoSpan) {
                const authorName = giftUsernameBtn.textContent?.trim() || 'Unknown';
                
                // Extract gift count - first standalone number span in the info text
                const numberSpans = giftInfoSpan.querySelectorAll('span');
                let giftCount = 1;
                let totalGifted: number | undefined;
                
                numberSpans.forEach((span, index) => {
                  const text = span.textContent?.trim() || '';
                  // First number is gift count, look for standalone number
                  if (/^\d+$/.test(text)) {
                    if (index === 0 || giftCount === 1) {
                      giftCount = parseInt(text, 10) || 1;
                    }
                  }
                  // Look for "X subscriptions" pattern for total
                  const totalMatch = text.match(/^(\d+)\s+subscription/i);
                  if (totalMatch) {
                    totalGifted = parseInt(totalMatch[1], 10);
                  }
                });
                
                const stableKey = `kick-gift|${authorName}|${giftCount}|${totalGifted || 0}`;
                const messageId = `kick_${cyrb53(stableKey)}`;
                visibleIds.push(messageId);
                
                const payload = {
                  id: messageId,
                  author: { name: authorName, avatar: '', flags: {}, badges: [], badgePosition: 'left' },
                  text: '',
                  segments: [],
                  timestamp: Date.now(),
                  kind: 'sub-gift',
                  giftCount,
                  totalGifted,
                  color: highlightColor || undefined
                };
                out.push(payload);
                return; // Skip normal message parsing
              }
              
              // Check for SUBSCRIPTION: has span.text-surface-onSurfaceSecondary with button INSIDE it
              const subContainer = highlightContainer.querySelector('span.text-surface-onSurfaceSecondary') as HTMLElement | null;
              const subUsernameBtn = subContainer?.querySelector('button.font-bold') as HTMLElement | null;
              if (subContainer && subUsernameBtn) {
                const authorName = subUsernameBtn.textContent?.trim() || 'Unknown';
                
                // Extract username color from style
                let nameColor = '';
                const style = subUsernameBtn.getAttribute('style') || '';
                const colorMatch = style.match(/color:\s*([^;]+)/i);
                if (colorMatch) nameColor = colorMatch[1].trim();
                
                // Find month count - look for standalone span with just a number
                const monthSpans = subContainer.querySelectorAll('span');
                let months = 1;
                monthSpans.forEach(span => {
                  const text = span.textContent?.trim() || '';
                  // Match standalone numbers (month count)
                  if (/^\d+$/.test(text)) {
                    months = parseInt(text, 10) || 1;
                  }
                });
                
                const stableKey = `kick-sub|${authorName}|${months}`;
                const messageId = `kick_${cyrb53(stableKey)}`;
                visibleIds.push(messageId);
                
                const payload = {
                  id: messageId,
                  author: { name: authorName, avatar: '', flags: { member: true }, badges: [], nameColor: nameColor || undefined, badgePosition: 'left' },
                  text: '',
                  segments: [],
                  timestamp: Date.now(),
                  kind: 'sub',
                  months,
                  color: highlightColor || undefined
                };
                out.push(payload);
                return; // Skip normal message parsing
              }
              
              // Check for REDEMPTION: has p.line-clamp-2 with span.font-bold (reward name)
              const rewardSpan = highlightContainer.querySelector('p.line-clamp-2 span.font-bold') as HTMLElement | null;
              const usernameBtn = highlightContainer.querySelector('button.inline.font-bold') as HTMLElement | null;
              // Regular chat messages have title attribute, redemptions don't
              const hasNoTitleAttr = usernameBtn && !usernameBtn.hasAttribute('title');
              
              if (rewardSpan && hasNoTitleAttr) {
                const authorName = usernameBtn?.textContent?.trim() || 'Unknown';
                
                // Extract username color from style
                let nameColor = '';
                const style = usernameBtn?.getAttribute('style') || '';
                const colorMatch = style.match(/color:\s*([^;]+)/i);
                if (colorMatch) nameColor = colorMatch[1].trim();
                
                // Find the reward name
                const rewardName = rewardSpan.textContent?.trim() || 'Reward';
                
                const stableKey = `kick-redeem|${authorName}|${rewardName}`;
                const messageId = `kick_${cyrb53(stableKey)}`;
                visibleIds.push(messageId);
                
                const payload = {
                  id: messageId,
                  author: { name: authorName, avatar: '', flags: {}, badges: [], nameColor: nameColor || undefined, badgePosition: 'left' },
                  text: `redeemed ${rewardName}`,
                  segments: [{ t: 'text', text: `redeemed ${rewardName}` }],
                  timestamp: Date.now(),
                  kind: 'redemption',
                  rewardName,
                  color: highlightColor || undefined
                };
                out.push(payload);
                return; // Skip normal message parsing
              }
            }
          }
          
          // Find the username button with title attribute
          const usernameEl = element.querySelector('button.inline.font-bold[title]') as HTMLElement | null;
          if (!usernameEl) {
            const fallback = parseTextRowFallback(element);
            if (!fallback) return;

            const stableKey = `kick|${fallback.authorName}|${fallback.messageText}|${fallback.segments.filter(s => s.t === 'emote').map(s => s.url).join(',')}`;
            const messageId = `kick_${cyrb53(stableKey)}`;
            visibleIds.push(messageId);

            out.push({
              id: messageId,
              author: {
                name: fallback.authorName,
                avatar: '',
                flags: fallback.flags,
                badges: fallback.badges,
                nameColor: fallback.nameColor || undefined,
                badgePosition: 'left'
              },
              text: fallback.messageText,
              segments: fallback.segments,
              timestamp: Date.now(),
              kind: 'text'
            });
            return;
          }
          
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
          const messageId = `kick_${cyrb53(stableKey)}`;
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

    this.processRawMessages(result as any);
  }
}

export default KickChatCapture;
