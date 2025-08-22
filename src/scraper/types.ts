export type ChatKind = 'text' | 'donation' | 'member' | 'member-milestone' | 'member-gift' | 'sticker';

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
}

export interface ScraperOptions {
  pollInterval?: number;
  quiet?: boolean;
  maxRetries?: number;
  retryDelay?: number;
  onMessage?: (message: ChatEvent) => void;
  onError?: (error: Error) => void;
  onStatusChange?: (status: any) => void;
}
