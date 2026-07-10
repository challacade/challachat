export type ChatKind = 'text' | 'donation' | 'cheer' | 'member' | 'member-renewal' | 'member-milestone' | 'member-gift' | 'sub' | 'sub-gift' | 'sticker' | 'streak' | 'redemption';

/** Supported streaming platforms */
export type Platform = 'youtube' | 'twitch' | 'kick';

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

/** Optional visual style for a text segment (set by chat commands). */
export type SegmentStyle = { bold?: boolean; italic?: boolean; color?: string };

export type Segment = { t: 'text'; text: string; style?: SegmentStyle } | { t: 'emote'; url: string; alt?: string };

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
  /** System/platform message (e.g. "Subscribed at Tier 1. They've subscribed for 24 months!") */
  systemMessage?: string;
  /** Reply context when this message is a reply to another message */
  replyTo?: {
    username: string;
    messagePreview: string;
  };
  /** Reward name for redemption messages (channel points, etc.) */
  rewardName?: string;
  /** Subscription/membership month count */
  months?: number;
  /** Number of gift subs given in this event */
  giftCount?: number;
  /** Total gift subs given by this user in the channel */
  totalGifted?: number;
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
