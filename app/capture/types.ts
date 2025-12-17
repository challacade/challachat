export type ChatKind = 'text' | 'donation' | 'cheer' | 'member' | 'member-renewal' | 'member-milestone' | 'member-gift' | 'sub' | 'sub-gift' | 'sticker';

/** Supported streaming platforms */
export type Platform = 'youtube' | 'twitch';

export interface AuthorFlags {
  owner?: boolean;
  mod?: boolean;
  verified?: boolean;
  member?: boolean;
}

export interface AuthorBadge {
  url?: string;
  alt?: string;
  emoji?: string;
  type?: string;
}

export interface AuthorInfo {
  name: string;
  avatar?: string;
  flags?: AuthorFlags;
  badges?: AuthorBadge[];
  /** Username display color (primarily used by Twitch) */
  nameColor?: string;
  /** Where badges appear relative to username: 'left' (Twitch) or 'right' (YouTube, default) */
  badgePosition?: 'left' | 'right';
}

export type Segment = { t: 'text'; text: string } | { t: 'emote'; url: string; alt?: string };

export interface ChatEvent {
  id: string;
  author: AuthorInfo;
  text: string;
  segments?: Segment[];
  kind: ChatKind;
  ts: number;
  amountDisplay?: string;
  color?: string;
  hasCard?: boolean;
  // Optional rendering hint for overlays (primarily for system messages)
  showUsername?: boolean;
  // Optional visual effects flags for overlays
  effects?: {
    jam?: boolean;
    jamFinale?: boolean;
  };
  /** System/platform message (e.g. "Subscribed at Tier 1. They've subscribed for 24 months!") */
  systemMessage?: string;
  /** Reply context when this message is a reply to another message */
  replyTo?: {
    username: string;
    messagePreview: string;
  };
}

export interface CaptureOptions {
  pollInterval?: number;
  quiet?: boolean;
  maxRetries?: number;
  retryDelay?: number;
  onMessage?: (message: ChatEvent) => void;
  onError?: (error: Error) => void;
  onStatusChange?: (status: any) => void;
  // Called when a message that was previously emitted is detected as deleted
  // or removed from the live chat DOM. The overlay should remove it by id.
  onDelete?: (id: string) => void;
}
