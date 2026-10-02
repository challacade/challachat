import type { Platform } from './types';

export type YouTubeSourceKind = 'direct-video' | 'channel-live' | 'studio' | 'shortlink';

export function detectPlatform(url: string): Platform | null {
  const normalized = String(url || '').toLowerCase();
  if (normalized.includes('youtube.com') || normalized.includes('youtu.be')) return 'youtube';
  if (normalized.includes('twitch.tv')) return 'twitch';
  if (normalized.includes('kick.com')) return 'kick';
  return null;
}

/** Channel name from `<domain>/<channel>`, `<domain>/<channel>/chat`, or `<domain>/popout/<channel>/chat`. */
function extractChannel(url: string, domain: string): string | null {
  try {
    const u = new URL(url);
    if (!u.hostname.includes(domain)) return null;
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length === 0) return null;
    if (parts[0] === 'popout' && parts.length >= 2) return parts[1].toLowerCase();
    return parts[0].toLowerCase();
  } catch {
    const escaped = domain.replace(/\./g, '\\.');
    const match = url.match(new RegExp(`${escaped}\\/(?:popout\\/)?([^/?&#]+)`, 'i'));
    return match ? match[1].toLowerCase() : null;
  }
}

export function extractTwitchChannel(url: string): string | null {
  return extractChannel(url, 'twitch.tv');
}

export function extractKickChannel(url: string): string | null {
  return extractChannel(url, 'kick.com');
}

/** Video id from any YouTube URL shape that contains it directly (no network). */
export function extractVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === 'studio.youtube.com') {
      if (u.pathname === '/live_chat') return u.searchParams.get('v');
      // e.g. https://studio.youtube.com/video/<videoId>/livestreaming
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts.length >= 2 && parts[0] === 'video') return parts[1];
    }

    if (u.pathname === '/watch') return u.searchParams.get('v');
    if (u.pathname.startsWith('/live/')) return u.pathname.replace('/live/', '');
    if (u.pathname === '/live_chat') return u.searchParams.get('v');
    if (u.pathname === '/live_dashboard') return u.searchParams.get('v');
    if (u.hostname === 'youtu.be') return u.pathname.slice(1);
  } catch {
    const regex = /(?:studio\.youtube\.com\/video\/|studio\.youtube\.com\/live_chat\?[^\n]*v=|youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/live\/|youtube\.com\/live_chat\?v=|youtube\.com\/live_dashboard\?v=)([^&\n?#/]+)/;
    const match = url.match(regex);
    return match ? match[1] : null;
  }
  return null;
}

export function extractVideoIdFromYouTubeHtml(html: string): string | null {
  if (!html) return null;

  const canonicalWatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})/i);
  if (canonicalWatch?.[1]) return canonicalWatch[1];

  const shortLink = html.match(/<link[^>]+rel=["']shortlinkUrl["'][^>]+href=["']https?:\/\/youtu\.be\/([A-Za-z0-9_-]{11})/i);
  if (shortLink?.[1]) return shortLink[1];

  const embedded = html.match(/"videoId":"([A-Za-z0-9_-]{11})"/);
  return embedded?.[1] ?? null;
}

/** `youtube.com/@handle/live` - needs a network lookup to find the current video id. */
export function isYouTubeHandleLiveUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.hostname !== 'youtube.com' && !u.hostname.endsWith('.youtube.com')) return false;
    return /^\/@[^/]+\/live\/?$/i.test(u.pathname);
  } catch {
    return /(?:^|\.)youtube\.com\/@[^/?#]+\/live\/?(?:[?#].*)?$/i.test(url);
  }
}

export function toPublicLiveUrl(videoId: string): string {
  return `https://www.youtube.com/live/${videoId}`;
}

export function getYouTubeSourceKind(url: string): YouTubeSourceKind {
  try {
    const u = new URL(url);
    if (u.hostname === 'studio.youtube.com') return 'studio';
    if (u.hostname === 'youtu.be') return 'shortlink';
    if (isYouTubeHandleLiveUrl(url)) return 'channel-live';
  } catch {
    if (isYouTubeHandleLiveUrl(url)) return 'channel-live';
    if (/studio\.youtube\.com/i.test(url)) return 'studio';
    if (/youtu\.be\//i.test(url)) return 'shortlink';
  }
  return 'direct-video';
}

export function extractYouTubeChannelLiveUrl(url: string): string | undefined {
  try {
    const u = new URL(url);
    if (!isYouTubeHandleLiveUrl(url)) return undefined;
    const handle = u.pathname.split('/').filter(Boolean)[0];
    return handle ? `https://www.youtube.com/${handle}` : undefined;
  } catch {
    const match = url.match(/(?:^|\.)youtube\.com\/(%40[^/?#]+|@[^/?#]+)\/live\/?/i);
    return match?.[1] ? `https://www.youtube.com/${decodeURIComponent(match[1])}` : undefined;
  }
}

export function extractYouTubeChannelLabel(channelUrl: string): string | undefined {
  try {
    const u = new URL(channelUrl);
    const firstPart = u.pathname.split('/').filter(Boolean)[0];
    return firstPart ? decodeURIComponent(firstPart) : undefined;
  } catch {
    const match = channelUrl.match(/youtube\.com\/([^/?#]+)/i);
    return match?.[1] ? decodeURIComponent(match[1]) : undefined;
  }
}
