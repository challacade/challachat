import type { AuthorInfo, ChatEvent, ChatKind } from './types';

interface SpoofMessage {
  author: AuthorInfo;
  text: string;
  kind: ChatKind;
  pauseAfter?: number;
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
      author: { name: 'TrailerViewer', avatar: '', flags: {}, nameColor: '#779eff' },
      text: 'Display messages in real-time ⚡',
      kind: 'text'
    },
    {
      author: { name: 'TrailerViewer', avatar: '', flags: {}, nameColor: '#ff6e7a' },
      text: 'Works with OBS, Streamlabs, and more!',
      kind: 'text'
    },
    {
      author: { name: 'TrailerViewer', avatar: '', flags: {}, nameColor: '#7bffa9' },
      text: 'Any layout, any style ✨',
      kind: 'text',
      pauseAfter: 5,
    },
  ],
  custom: [
    {
      author: { name: 'CustomViewer', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=CustomViewer&backgroundColor=a8e6cf', flags: {} },
      text: 'Custom placeholder message',
      kind: 'text'
    },
  ],
};

export interface SpoofCallbacks {
  onMessage: (m: ChatEvent) => void;
}

/**
 * SpoofCapture — emits pre-defined dummy messages on a timer.
 *
 * Conforms to the same surface as BaseChatCapture that Connection expects
 * (start, stop, setPollInterval, pollInterval) but requires no browser.
 */
export class SpoofCapture {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private index = 0;
  private running = false;
  private callbacks: SpoofCallbacks;
  private intervalMs = 3000;
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
    const delay = prevMsg?.pauseAfter ? this.intervalMs * prevMsg.pauseAfter : this.intervalMs;
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
    };
    this.callbacks.onMessage(event);
  }
}
