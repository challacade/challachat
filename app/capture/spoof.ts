import type { AuthorInfo, ChatEvent, ChatKind, Segment } from './types';

interface SpoofMessage {
  author: AuthorInfo;
  text: string;
  kind: ChatKind;
  delay?: number;
  amountDisplay?: string;
  color?: string;
  segments?: Segment[];
  effects?: { jam?: boolean; jamFinale?: boolean };
}

const SPOOF_PRESETS: Record<string, SpoofMessage[]> = {
  welcome: [
  {
    author: {
      name: 'StreamHelper',
      avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=StreamHelper&backgroundColor=b6e3f4',
      flags: { mod: true }
    },
    text: 'Welcome to ChallaChat! 👋',
    kind: 'text'
  },
  {
    author: {
      name: 'TechGuru',
      avatar: 'https://api.dicebear.com/7.x/shapes/svg?seed=TechGuru&backgroundColor=c0aede',
      flags: {}
    },
    text: "Add this page's URL as a browser source in your streaming software!",
    kind: 'text'
  },
  {
    author: {
      name: 'OBSExpert',
      avatar: 'https://api.dicebear.com/7.x/identicon/svg?seed=OBSExpert&backgroundColor=ffd93d',
      flags: { verified: true }
    },
    text: 'OBS, Streamlabs, anything works! 🎬',
    kind: 'text'
  },
  {
    author: {
      name: 'ChatMaster',
      avatar: 'https://api.dicebear.com/7.x/bottts-neutral/svg?seed=ChatMaster&backgroundColor=ffb3ba',
      flags: { member: true }
    },
    text: 'The overlay displays all your chat messages in real-time ⚡',
    kind: 'text'
  },
  {
    author: {
      name: 'DesignPro',
      avatar: 'https://api.dicebear.com/7.x/shapes/svg?seed=DesignPro&backgroundColor=bae1ff',
      flags: {}
    },
    text: 'Customize themes and colors from the admin panel! 🎨',
    kind: 'text'
  },
  {
    author: {
      name: 'SupportBot',
      avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=SupportBot&backgroundColor=a8e6cf',
      flags: { owner: true }
    },
    text: 'Manage everything from the admin panel ⚙️',
    kind: 'text'
  },
  {
    author: {
      name: 'StreamFan',
      avatar: 'https://api.dicebear.com/7.x/identicon/svg?seed=StreamFan&backgroundColor=ffc9de',
      flags: {}
    },
    text: 'This works with Twitch, YouTube, Kick, and more!',
    kind: 'text'
  },
  {
    author: {
      name: 'PrivacyAdvocate',
      avatar: 'https://api.dicebear.com/7.x/shapes/svg?seed=PrivacyAdvocate&backgroundColor=d4a574',
      flags: { verified: true }
    },
    text: 'All data stays local - no cloud services needed! 🔐',
    kind: 'text'
  },
  {
    author: {
      name: 'AudioEngineer',
      avatar: 'https://api.dicebear.com/7.x/bottts-neutral/svg?seed=AudioEngineer&backgroundColor=c7ceea',
      flags: { member: true }
    },
    text: 'Sound effects for donations and new members play in the admin panel! 🔊',
    kind: 'text'
  },
  {
    author: {
      name: 'CommunityMod',
      avatar: 'https://api.dicebear.com/7.x/identicon/svg?seed=CommunityMod&backgroundColor=b5ead7',
      flags: { mod: true }
    },
    text: 'Perfect for building community engagement! 💬',
    kind: 'text'
  }
  ],
  trailer: [
    {
      author: { name: 'Mod', avatar: '', flags: { mod: true }, badges: [{ url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' height='24' viewBox='0 0 24 24' width='24'%3E%3Cpath fill='%23419dff' d='M3 4.998v9.857a6 6 0 003.365 5.39L12 23l5.635-2.755A6 6 0 0021 14.855V4.998a1 1 0 00-.656-.938L12 1 3.656 4.06A1 1 0 003 4.998Z'/%3E%3C/svg%3E", alt: 'Moderator' }] },
      text: 'Display messages in real-time ⚡',
      kind: 'text',
      delay: 3000,
    },
    {
      author: { name: 'Viewer', avatar: '', flags: {}, nameColor: '#76ff8f' },
      text: 'No sign-in required!',
      segments: [
        { t: 'text', text: 'No sign-in required! ' },
        { t: 'emote', url: 'https://challacade.blob.core.windows.net/gallery/web/youtube.png', alt: 'YouTube' },
        { t: 'text', text: ' ' },
        { t: 'emote', url: 'https://challacade.blob.core.windows.net/gallery/web/twitch.png', alt: 'Twitch' },
        { t: 'text', text: ' ' },
        { t: 'emote', url: 'https://challacade.blob.core.windows.net/gallery/web/kick.png', alt: 'Kick' },
      ],
      kind: 'text',
      delay: 3000,
    },
    {
      author: { name: 'Designer', avatar: '', flags: {}, nameColor: '#ff766f', badges: [{ url: 'https://static-cdn.jtvnw.net/badges/v1/bbbe0db0-a598-423e-86d0-f9fb98ca1933/2', alt: 'Verified' }] },
      text: 'Fits any stream layout 📐',
      kind: 'text',
      delay: 3000,
    },
    {
      author: { name: 'Artist', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Artist&backgroundColor=b6e3f4', flags: { verified: true } },
      text: 'Tons of customization options!',
      segments: [
        { t: 'text', text: 'Tons of customization! ' },
        { t: 'emote', url: 'https://cdn.7tv.app/emote/01F73SYFT8000EAPG86BYDXPH4/4x.avif', alt: 'Clap' },
      ],
      kind: 'text',
      delay: 2600,
    },
    {
      author: { name: 'Mod', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Enthusiast&backgroundColor=ffd93d', flags: { mod: true }, badges: [{ url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' height='24' viewBox='0 0 24 24' width='24'%3E%3Cpath fill='%23419dff' d='M3 4.998v9.857a6 6 0 003.365 5.39L12 23l5.635-2.755A6 6 0 0021 14.855V4.998a1 1 0 00-.656-.938L12 1 3.656 4.06A1 1 0 003 4.998Z'/%3E%3C/svg%3E", alt: 'Moderator' }] },
      text: 'Emotes, badges, avatars, and more!',
      segments: [
        { t: 'text', text: 'Emotes, badges, avatars! ' },
        { t: 'emote', url: 'https://cdn.7tv.app/emote/01F6NPEJT0000B70V1XA8MNBC9/4x.avif', alt: 'peepoHappy' },
      ],
      kind: 'text',
      delay: 3200,
    },
    {
      author: { name: 'Streamer', avatar: '', flags: {}, nameColor: '#8aff7d' },
      text: 'Merge chatrooms!',
      segments: [
        { t: 'text', text: 'Merge chatrooms! ' },
        { t: 'text', text: ' ' },
        { t: 'emote', url: 'https://cdn.7tv.app/emote/01F7A96T680001569Q2SWB43A0/4x.avif', alt: 'emote' },
        { t: 'emote', url: 'https://cdn.7tv.app/emote/01F7A96T680001569Q2SWB43A0/4x.avif', alt: 'emote' },
        { t: 'emote', url: 'https://cdn.7tv.app/emote/01F7A96T680001569Q2SWB43A0/4x.avif', alt: 'emote' },
      ],
      kind: 'text',
      delay: 3200,
    },
    {
      author: { name: 'Supporter', avatar: '', flags: {}, nameColor: '#c792ea' },
      text: 'Donation alerts!',
      kind: 'donation',
      amountDisplay: '$10.00',
      color: '#1565c0',
      delay: 2500,
    },
    {
      author: { name: 'DJ', avatar: '', flags: {}, nameColor: '#80cbc4', badges: [{ url: 'https://static-cdn.jtvnw.net/badges/v1/3267646d-33f0-4b17-b3df-f923a41db1d0/2', alt: 'DJ' }] },
      text: 'Play your music!',
      segments: [
        { t: 'text', text: 'Music player, song display! ' },
        { t: 'emote', url: 'https://cdn.7tv.app/emote/01F6MQ33FG000FFJ97ZB8MWV52/4x.avif', alt: 'catJAM' },
        { t: 'emote', url: 'https://cdn.7tv.app/emote/01FYQZVG280006SX8JX4TD7SJA/4x.avif', alt: 'Jamming' },
      ],
      kind: 'text',
      delay: 2500,
    },
    {
      author: { name: 'Viewer', avatar: '', flags: {}, nameColor: '#76ff8f' },
      text: 'is jamming!',
      segments: [
        { t: 'text', text: 'is jamming! ' },
        { t: 'emote', url: 'https://cdn.7tv.app/emote/01F6MWBB8R000255K4X1KDFFY5/4x.avif', alt: 'NOTED' },
      ],
      kind: 'text',
      effects: { jam: true },
      delay: 5000,
    },
  ],
  custom: [
    {
      author: { name: 'CustomViewer', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=CustomViewer&backgroundColor=a8e6cf', flags: {} },
      text: 'Custom placeholder message',
      kind: 'text'
    },
    {
      author: { name: 'Organizer', avatar: 'https://api.dicebear.com/7.x/shapes/svg?seed=Organizer&backgroundColor=ffd93d', flags: { owner: true } },
      text: 'Scales to any size 📐',
      kind: 'text',
      delay: 2200,
    },
    {
      author: { name: 'Designer', avatar: '', flags: {}, nameColor: '#ff766f', badges: [{ url: 'https://static-cdn.jtvnw.net/badges/v1/bbbe0db0-a598-423e-86d0-f9fb98ca1933/2', alt: 'Verified' }] },
      text: 'Fits any stream layout',
      segments: [
        { t: 'text', text: 'Fits any stream layout ' },
        { t: 'emote', url: 'https://cdn.7tv.app/emote/01F6MWBB8R000255K4X1KDFFY5/4x.avif', alt: 'NOTED' },
      ],
      kind: 'text',
      delay: 3000,
    },
  ],
};

export interface SpoofCallbacks {
  onMessage: (m: ChatEvent) => void;
}

/**
 * SpoofCapture - emits pre-defined dummy messages on a timer.
 *
 * Conforms to the same surface as BaseChatCapture that Connection expects
 * (start, stop, setPollInterval, pollInterval) but requires no browser.
 */
export class SpoofCapture {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private index = 0;
  private running = false;
  private callbacks: SpoofCallbacks;
  private intervalMs = 4500;
  private preset = 'welcome';

  constructor(callbacks: SpoofCallbacks, intervalMs?: number) {
    this.callbacks = callbacks;
    if (intervalMs != null && intervalMs > 0) this.intervalMs = intervalMs;
  }

  get pollInterval(): number { return 0; }

  setPollInterval(_ms: number) { /* no-op for spoof */ }

  getIntervalMs(): number { return this.intervalMs; }

  setIntervalMs(ms: number) {
    if (ms > 0) this.intervalMs = ms;
  }

  getPreset(): string { return this.preset; }

  setPreset(preset: string) {
    if (preset in SPOOF_PRESETS) {
      this.preset = preset;
      this.index = 0;
    }
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.emitNext();
    this.scheduleNext();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNext() {
    if (!this.running) return;
    const messages = SPOOF_PRESETS[this.preset] || SPOOF_PRESETS.welcome;
    const prevIndex = (this.index - 1 + messages.length) % messages.length;
    const prevMsg = messages[prevIndex];
    const delay = prevMsg?.delay ?? this.intervalMs;
    this.timer = setTimeout(() => {
      this.emitNext();
      this.scheduleNext();
    }, delay);
  }

  private emitNext() {
    const messages = SPOOF_PRESETS[this.preset] || SPOOF_PRESETS.welcome;
    if (messages.length === 0) return;
    const msg = messages[this.index % messages.length];
    this.index = (this.index + 1) % messages.length;
    const event: ChatEvent = {
      id: `spoof_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      author: msg.author,
      text: msg.text,
      kind: msg.kind,
      ts: Date.now(),
      amountDisplay: msg.amountDisplay,
      color: msg.color,
      segments: msg.segments,
      effects: msg.effects,
    };
    this.callbacks.onMessage(event);
  }
}
