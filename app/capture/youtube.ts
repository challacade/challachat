/* eslint-disable no-console */
import { CaptureOptions } from './types';
import { BaseChatCapture } from './base';

/**
 * YouTubeChatCapture - Captures chat messages from a YouTube livestream.
 * Extends BaseChatCapture for shared browser/polling logic.
 */
export class YouTubeChatCapture extends BaseChatCapture {
  private videoId: string;
  protected readonly logPrefix = 'Capture';
  protected readonly chatUrl: string;
  protected readonly platformDomain = 'youtube.com';
  protected readonly platformName = 'youtube';
  protected readonly highPriorityKinds = ['donation', 'member', 'member-renewal', 'member-milestone', 'member-gift'];

  constructor(videoId: string, options: CaptureOptions = {}) {
    super(options);
    this.videoId = videoId;
    this.chatUrl = `https://www.youtube.com/live_chat?v=${videoId}`;
  }

  protected getStartingStatus() {
    return { status: 'starting', videoId: this.videoId };
  }

  protected getActiveStatus() {
    return { status: 'active', videoId: this.videoId };
  }

  protected getChatSelectors(): string[] {
    return [
      'yt-live-chat-text-message-renderer',
      '[data-test-id="chat-message"]',
      'yt-live-chat-item-list-renderer',
      '#chat-messages',
      '#items'
    ];
  }

  protected shouldAbortRequest(resourceType: string, url: string): boolean {
    if (resourceType === 'media' || resourceType === 'font') return true;
    if (url.includes('googlevideo.com') || url.includes('youtube.com/watch')) return true;
    return false;
  }

  protected async isValidPage(): Promise<boolean> {
    if (!this.page) return false;
    try {
      const title = await this.page.title();
      const url = this.page.url();
      return !!(title && (title.includes('Live Chat') || title.includes('YouTube')) && url.includes('youtube.com'));
    } catch {
      return false;
    }
  }

  protected async pollMessages(): Promise<void> {
    if (!this.page) return;
    const result = await this.page.evaluate(() => {
      // ─────────────────────────────────────────────────────────────────────
      // Helper functions (must be defined inside evaluate for browser context)
      // ─────────────────────────────────────────────────────────────────────
      const ccTag = (window as any).__ccTag;

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
        const rendererSelectors = ['#chat-badges yt-live-chat-author-badge-renderer', '#chip-badges yt-live-chat-author-badge-renderer', '#prepend-chat-badges yt-live-chat-author-badge-renderer', 'yt-live-chat-author-badge-renderer'];
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
        // Reuse outer-scope parseSrcSet / normalizeSize (same browser evaluate closure)
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

      // ─────────────────────────────────────────────────────────────────────
      // Main parsing logic
      // ─────────────────────────────────────────────────────────────────────
      const out: any[] = []; const emitted = new Set<string>();
      const visibleIds: string[] = [];
      const deletedIds: string[] = [];
      const listRoot = document.querySelector('yt-live-chat-item-list-renderer #items') || document.querySelector('yt-live-chat-item-list-renderer') || document;
      const qsa = (sel: string) => Array.from(listRoot!.querySelectorAll(sel));
      const isInTicker = (el: Element) => { try { return !!el.closest('yt-live-chat-ticker-renderer'); } catch { return false; } };
      const isDeletedState = (el: Element) => {
        try {
          const del = (el.querySelector('#deleted-state') as HTMLElement | null);
          if (del && (del.innerText || del.textContent || '').toLowerCase().includes('deleted')) return true;
          const message = el.querySelector('#message') as HTMLElement | null;
          if (message && ((message.innerText || '').trim() === '' || /message deleted/i.test(message.innerText || ''))) {
            const delLike = (el.textContent || '').toLowerCase();
            if (delLike.includes('message deleted')) return true;
          }
        } catch {}
        return false;
      };

      // Text messages
      const messageElements = qsa('yt-live-chat-text-message-renderer');
      messageElements.forEach((element) => {
        try {
          if (isInTicker(element)) return;
          const authorElement = element.querySelector('#author-name') as HTMLElement | null;
          const messageElement = element.querySelector('#message') as HTMLElement | null;
          if (!authorElement || !messageElement) return;
          const rendererId = element.getAttribute('id') || '';
          if (rendererId) visibleIds.push(rendererId);
          if (isDeletedState(element)) { if (rendererId) deletedIds.push(rendererId); return; }
          const authorName = authorElement.textContent?.trim() || 'Unknown';
          const segments: any[] = getSegmentsFromMessage(messageElement);
          const messageText = (segments || []).filter((s: any) => s.t === 'text').map((s: any) => s.text).join('').trim();
          const avatarUrl = getAuthorAvatarUrl(element);
          const flags = detectYouTubeUserRoles(element);
          const badges = getAuthorBadges(element);
          if (!messageText && (!segments || segments.length === 0)) return;
          const hasCard = hasCardWithin(element);
          const contentKey = `text|${authorName}|${messageText}|${(segments||[]).filter((s: any)=>s.t==='emote').map((s: any)=>s.url).join(',')}`;
          const messageId = rendererId || `h_${ccTag(element, contentKey)}`;
          if (!rendererId) visibleIds.push(messageId);
          const payload = { id: messageId, author: { name: authorName, avatar: avatarUrl, flags, badges }, text: messageText, segments, timestamp: Date.now(), kind: 'text', hasCard };
          out.push(payload); emitted.add(messageId);
        } catch {}
      });

      // Paid messages (Super Chat)
      const paidElements = qsa('yt-live-chat-paid-message-renderer');
      paidElements.forEach((element) => {
        try {
          if (isInTicker(element)) return;
          const authorElement = element.querySelector('#author-name') as HTMLElement | null;
          if (!authorElement) return;
          const messageElement = element.querySelector('#message') as HTMLElement | null;
          const rendererId = element.getAttribute('id') || '';
          if (rendererId) visibleIds.push(rendererId);
          if (isDeletedState(element)) { if (rendererId) deletedIds.push(rendererId); return; }
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
          const contentKey = `donation|${authorName}|${amountDisplay}|${messageText}`;
          const messageId = rendererId || `h_${ccTag(element, contentKey)}`;
          if (!rendererId) visibleIds.push(messageId);
          const payload = { id: messageId, author: { name: authorName, avatar: avatarUrl, flags, badges }, text: messageText, segments, timestamp: Date.now(), kind: 'donation', amountDisplay, color, hasCard };
          out.push(payload); emitted.add(messageId);
        } catch {}
      });

      // Stickers (Super Sticker)
      const stickerElements = qsa('yt-live-chat-paid-sticker-renderer');
      stickerElements.forEach((element) => {
        try {
          if (isInTicker(element)) return;
          const authorElement = element.querySelector('#author-name') as HTMLElement | null;
          if (!authorElement) return;
          const rendererId = element.getAttribute('id') || '';
          if (rendererId) visibleIds.push(rendererId);
          if (isDeletedState(element)) { if (rendererId) deletedIds.push(rendererId); return; }
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
          const contentKey = `sticker|${authorName}|${amountDisplay}|${stickerUrl}`;
          const messageId = rendererId || `h_${ccTag(element, contentKey)}`;
          if (!rendererId) visibleIds.push(messageId);
          if (emitted.has(messageId)) return;
          const payload = { id: messageId, author: { name: authorName, avatar: avatarUrl, flags, badges }, text: '', segments, timestamp: Date.now(), kind: 'donation', amountDisplay, hasCard };
          out.push(payload); emitted.add(messageId);
        } catch {}
      });

      // Member joins
      const memberJoinElements = qsa('yt-live-chat-membership-item-renderer');
      memberJoinElements.forEach((element) => {
        try {
          if (isInTicker(element)) return;
          const authorElement = element.querySelector('#author-name') as HTMLElement | null;
          if (!authorElement) return;
          const rendererId = element.getAttribute('id') || '';
          if (rendererId) visibleIds.push(rendererId);
          if (isDeletedState(element)) { if (rendererId) deletedIds.push(rendererId); return; }
          const authorName = authorElement.textContent?.trim() || 'Unknown';
          const headerPrimaryText = (element.querySelector('#header-primary-text') as HTMLElement | null)?.textContent?.trim() || '';
          const isRenewal = /Member for \d+/i.test(headerPrimaryText) || /\d+\s*months?/i.test(headerPrimaryText) || /\d+\s*years?/i.test(headerPrimaryText);
          const badgeElements = element.querySelectorAll('#chat-badges yt-live-chat-author-badge-renderer, #chip-badges yt-live-chat-author-badge-renderer');
          const hasLongTermBadge = Array.from(badgeElements).some(badge => {
            const aria = badge.getAttribute('aria-label') || badge.getAttribute('shared-tooltip-text') || '';
            return /Member \(\d+\s*(month|year)/i.test(aria);
          });
          const messageElement = element.querySelector('#message') || element.querySelector('#header-subtext') || element.querySelector('#subtext') || element as Element;
          const segments: any[] = messageElement ? getSegmentsFromMessage(messageElement) : [];
          let messageText = (segments || []).filter((s: any) => s.t === 'text').map((s: any) => s.text).join('').trim();
          let kind = 'member';
          if (isRenewal || hasLongTermBadge) {
            kind = 'member-renewal';
            if (!messageText) messageText = headerPrimaryText || 'Membership renewed';
          } else {
            if (!messageText) messageText = 'New member!';
          }
          const avatarUrl = getAuthorAvatarUrl(element);
          const flags = detectYouTubeUserRoles(element);
          const badges = getAuthorBadges(element);
          const hasCard = hasCardWithin(element);
          const contentKey = `${kind}|${authorName}|${messageText}`;
          const messageId = rendererId || `h_${ccTag(element, contentKey)}`;
          if (!rendererId) visibleIds.push(messageId);
          out.push({ id: messageId, author: { name: authorName, avatar: avatarUrl, flags, badges }, text: messageText, segments, timestamp: Date.now(), kind, hasCard });
        } catch {}
      });

      // Member milestones
      const milestoneElements = qsa('yt-live-chat-membership-milestone-renderer, yt-live-chat-membership-milestone-chip-renderer');
      milestoneElements.forEach((element) => {
        try {
          if (isInTicker(element)) return;
          const authorElement = element.querySelector('#author-name') as HTMLElement | null;
          if (!authorElement) return;
          const rendererId = element.getAttribute('id') || '';
          if (rendererId) visibleIds.push(rendererId);
          if (isDeletedState(element)) { if (rendererId) deletedIds.push(rendererId); return; }
          const authorName = authorElement.textContent?.trim() || 'Unknown';
          const messageElement = element.querySelector('#message') || element as Element;
          const segments: any[] = getSegmentsFromMessage(messageElement);
          const messageText = (segments || []).filter((s: any) => s.t === 'text').map((s: any) => s.text).join('').trim() || 'Member milestone!';
          const avatarUrl = getAuthorAvatarUrl(element);
          const flags = detectYouTubeUserRoles(element);
          const badges = getAuthorBadges(element);
          const hasCard = hasCardWithin(element);
          const contentKey = `member-milestone|${authorName}|${messageText}`;
          const messageId = rendererId || `h_${ccTag(element, contentKey)}`;
          if (!rendererId) visibleIds.push(messageId);
          out.push({ id: messageId, author: { name: authorName, avatar: avatarUrl, flags, badges }, text: messageText, segments, timestamp: Date.now(), kind: 'member-milestone', hasCard });
        } catch {}
      });

      // Gift memberships
      const giftSelectors = ['ytd-sponsorships-live-chat-header-renderer', 'yt-live-chat-sponsor-gift-purchase-announcement-renderer', 'yt-live-chat-gift-purchase-announcement-renderer'];
      const giftElements = giftSelectors.flatMap(sel => Array.from(document.querySelectorAll(sel)));
      giftElements.forEach((element) => {
        try {
          if (isInTicker(element)) return;
          const rendererId = element.getAttribute('id') || '';
          if (rendererId) visibleIds.push(rendererId);
          const authorName = ((element.querySelector('yt-live-chat-author-chip #author-name') as HTMLElement | null)?.textContent || (element.querySelector('#author-name') as HTMLElement | null)?.textContent || '').trim() || 'Unknown';
          const primaryText = (element.querySelector('#primary-text') as HTMLElement | null)?.textContent?.trim() || '';
          const text = primaryText || 'Gifted memberships';
          const avatarUrl = getAuthorAvatarUrl(element);
          const flags = detectYouTubeUserRoles(element);
          const badges = getAuthorBadges(element);
          const hasCard = true;
          const contentKey = `member-gift|${authorName}|${text}`;
          // Gift selectors can match nested elements for the same announcement —
          // dedupe within this poll by content, not element id.
          if ((emitted as Set<string>).has(contentKey)) return;
          const messageId = rendererId || `h_${ccTag(element, contentKey)}`;
          if (!rendererId) visibleIds.push(messageId);
          out.push({ id: messageId, author: { name: authorName, avatar: avatarUrl, flags, badges }, text, segments: [], timestamp: Date.now(), kind: 'member-gift', hasCard });
          (emitted as Set<string>).add(contentKey);
        } catch {}
      });

      return { messages: out, visibleIds, deletedIds };
    });

    this.processRawMessages(result as any);
  }
}

export default YouTubeChatCapture;
