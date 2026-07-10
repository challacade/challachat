import type { AuthorInfo, ChatEvent, ChatKind, Segment } from './types';

interface SpoofMessage {
  author: AuthorInfo;
  text: string;
  kind: ChatKind;
  delay?: number;
  amountDisplay?: string;
  color?: string;
  segments?: Segment[];
}

function jam(author: AuthorInfo, delay = 3000): SpoofMessage {
  // Emits a literal "!jam" chat message so it flows through the real command engine.
  return {
    author,
    text: '!jam',
    kind: 'text',
    delay,
  };
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
      author: { name: 'Mod', avatar: '', flags: { mod: true }, nameColor: '#69c8ff', badges: [{ url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' height='24' viewBox='0 0 24 24' width='24'%3E%3Cpath fill='%2369c8ff' d='M3 4.998v9.857a6 6 0 003.365 5.39L12 23l5.635-2.755A6 6 0 0021 14.855V4.998a1 1 0 00-.656-.938L12 1 3.656 4.06A1 1 0 003 4.998Z'/%3E%3C/svg%3E", alt: 'Moderator' }] },
      text: 'Display messages in real-time ⚡',
      kind: 'text',
      delay: 2150,
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
      delay: 2150,
    },
    // {
    //   author: { name: 'OBS', avatar: '', flags: {}, nameColor: '#5efcff' },
    //   text: 'Add to any streaming software!',
    //   kind: 'text',
    //   delay: 2150,
    // },
    {
      author: { name: 'Designer', avatar: '', flags: {}, nameColor: '#ff9ea1' },
      text: 'Fits any style or layout 📐',
      kind: 'text',
      delay: 4350,
    },
    {
      author: { name: 'Artist', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Artist&backgroundColor=b6e3f4', flags: { verified: true } },
      text: 'Tons of customization options!',
      segments: [
        { t: 'text', text: 'Tons of customization! ' },
        { t: 'emote', url: 'https://cdn.7tv.app/emote/01F73SYFT8000EAPG86BYDXPH4/4x.avif', alt: 'Clap' },
      ],
      kind: 'text',
      delay: 2150,
    },
    {
      author: { name: 'Mod', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Enthusiast&backgroundColor=ffd93d', flags: { mod: true }, nameColor: '#69c8ff', badges: [{ url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' height='24' viewBox='0 0 24 24' width='24'%3E%3Cpath fill='%2369c8ff' d='M3 4.998v9.857a6 6 0 003.365 5.39L12 23l5.635-2.755A6 6 0 0021 14.855V4.998a1 1 0 00-.656-.938L12 1 3.656 4.06A1 1 0 003 4.998Z'/%3E%3C/svg%3E", alt: 'Moderator' }] },
      text: 'Emotes, badges, avatars, and more!',
      segments: [
        { t: 'text', text: 'Emotes, badges, avatars! ' },
        { t: 'emote', url: 'https://cdn.7tv.app/emote/01F6NPEJT0000B70V1XA8MNBC9/4x.avif', alt: 'peepoHappy' },
      ],
      kind: 'text',
      delay: 2150,
    },
    {
      author: { name: 'Streamer', avatar: '', flags: {}, nameColor: '#5effb7' },
      text: 'Merge chatrooms!',
      segments: [
        { t: 'text', text: 'Merge chatrooms! ' },
        { t: 'text', text: ' ' },
        { t: 'emote', url: 'https://cdn.7tv.app/emote/01F7A96T680001569Q2SWB43A0/4x.avif', alt: 'emote' },
        { t: 'emote', url: 'https://cdn.7tv.app/emote/01F7A96T680001569Q2SWB43A0/4x.avif', alt: 'emote' },
        { t: 'emote', url: 'https://cdn.7tv.app/emote/01F7A96T680001569Q2SWB43A0/4x.avif', alt: 'emote' },
      ],
      kind: 'text',
      delay: 4350,
    },
    {
      author: { name: 'Supporter', avatar: '', flags: {}, nameColor: '#d698ff' },
      text: 'Donation alerts!',
      kind: 'donation',
      amountDisplay: '$10.00',
      color: '#1565c0',
      delay: 2150,
    },
    {
      author: { name: 'DJ', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=DJ&backgroundColor=b6e3f4', flags: { member: true }, nameColor: '#41ff41' },
      text: 'Play your music!',
      segments: [
        { t: 'text', text: 'Music player! ' },
        { t: 'emote', url: 'https://cdn.7tv.app/emote/01F6N71JE8000EJ3T4BS1S7P88/4x.avif', alt: 'hype' },
        { t: 'emote', url: 'https://cdn.7tv.app/emote/01F6N71JE8000EJ3T4BS1S7P88/4x.avif', alt: 'hype' },
        { t: 'emote', url: 'https://cdn.7tv.app/emote/01F6N71JE8000EJ3T4BS1S7P88/4x.avif', alt: 'hype' },
      ],
      kind: 'text',
      delay: 2150,
    },
    jam({ name: 'Viewer', avatar: '', flags: {}, nameColor: '#76ff8f' }, 1000),
    jam({ name: 'MusicFan', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=MusicFan&backgroundColor=ffb3ba', flags: { member: true }, nameColor: '#ffffff' }, 600),
    jam({ name: 'NightOwl', avatar: '', flags: {}, nameColor: '#c792ea', badges: [{ url: 'https://static-cdn.jtvnw.net/badges/v1/bbbe0db0-a598-423e-86d0-f9fb98ca1933/2', alt: 'Verified' }] }, 200),
    {
      author: { name: 'HypeFan', avatar: '', flags: {}, nameColor: '#ffda6b' },
      text: 'WOOO!!',
      kind: 'text',
      delay: 300,
    },
    jam({ name: 'PixelPunk', avatar: '', flags: {}, nameColor: '#ff76ff' }, 300),
    {
      author: { name: 'StarGazer', avatar: '', flags: {}, nameColor: '#ffda6b' },
      text: 'WOOO!!',
      segments: [
        { t: 'emote', url: 'https://cdn.7tv.app/emote/01EZY967K0000CYST6006V20T8/4x.avif', alt: 'hype' },
        { t: 'emote', url: 'https://cdn.7tv.app/emote/01EZY967K0000CYST6006V20T8/4x.avif', alt: 'hype' },
        { t: 'emote', url: 'https://cdn.7tv.app/emote/01EZY967K0000CYST6006V20T8/4x.avif', alt: 'hype' },
      ],
      kind: 'text',
      delay: 100,
    },
    jam({ name: 'ZenMode', avatar: '', flags: {}, nameColor: '#a8d8ea' }, 400),
    jam({ name: 'BeatDrop', avatar: '', flags: {}, nameColor: '#828aff', badges: [{ url: 'https://static-cdn.jtvnw.net/badges/v1/3267646d-33f0-4b17-b3df-f923a41db1d0/2', alt: 'DJ' }] }, 300),
    {
      author: { name: 'CloudNine', avatar: '', flags: {}, nameColor: '#6bffb5' },
      text: 'LETS GOOO',
      segments: [
        { t: 'text', text: 'AMAZING!! ' },
        { t: 'emote', url: 'https://cdn.7tv.app/emote/01FP65D8X0000EJT2EVEY3JD82/4x.avif', alt: 'hype' },
        { t: 'emote', url: 'https://cdn.7tv.app/emote/01FP65D8X0000EJT2EVEY3JD82/4x.avif', alt: 'hype' },
      ],
      kind: 'text',
      delay: 200,
    },
    jam({ name: 'GlowUp', avatar: 'https://api.dicebear.com/7.x/bottts-neutral/svg?seed=GlowUp&backgroundColor=c7ceea', flags: {}, nameColor: '#ffffff' }, 200),
    jam({ name: 'VibeTribe', avatar: '', flags: {}, nameColor: '#80cbc4' }, 500),
    {
      author: { name: 'SunBurst', avatar: '', flags: {}, nameColor: 'rgb(255, 154, 114)' },
      text: 'THIS IS AWESOME',
      segments: [
        { t: 'emote', url: 'https://cdn.7tv.app/emote/01F6MQ33FG000FFJ97ZB8MWV52/4x.avif', alt: 'catJAM' },
        { t: 'emote', url: 'https://cdn.7tv.app/emote/01FYQZVG280006SX8JX4TD7SJA/4x.avif', alt: 'Jamming' },
      ],
      kind: 'text',
      delay: 300,
    },
    {
      author: { name: 'HypeFan', avatar: '', flags: {}, nameColor: '#ffda6b' },
      text: 'AWESOME!',
      kind: 'text',
      delay: 100,
    },
    jam({ name: 'EchoWave', avatar: '', flags: {}, nameColor: '#ff89a3' }, 400),
    jam({ name: 'ChillZone', avatar: '', flags: {}, nameColor: '#a8d8ea' }, 3000),
  ],
  audience: [
    {
      author: { name: 'xander_w', avatar: 'https://api.dicebear.com/7.x/thumbs/svg?seed=xander_w&backgroundColor=b6e3f4', flags: {} },
      text: 'hi everyone!',
      kind: 'text',
    },
    {
      author: { name: 'SarahLyn', avatar: 'https://api.dicebear.com/7.x/thumbs/svg?seed=SarahLyn&backgroundColor=ffc9de', flags: {} },
      text: 'just found this channel, loving it so far',
      kind: 'text',
      delay: 4200,
    },
    {
      author: { name: 'coolguy99', avatar: 'https://api.dicebear.com/7.x/thumbs/svg?seed=coolguy99&backgroundColor=c0aede', flags: {} },
      text: 'lol same',
      kind: 'text',
      delay: 2800,
    },
    {
      author: { name: 'mattv', avatar: 'https://api.dicebear.com/7.x/thumbs/svg?seed=mattv&backgroundColor=a8e6cf', flags: {} },
      text: 'been watching for like 2 hours now',
      kind: 'text',
      delay: 5500,
    },
    {
      author: { name: 'JessicaRose', avatar: 'https://api.dicebear.com/7.x/thumbs/svg?seed=JessicaRose&backgroundColor=ffb3ba', flags: {} },
      text: 'hi from australia 👋',
      kind: 'text',
      delay: 3800,
    },
    {
      author: { name: 'xander_w', avatar: 'https://api.dicebear.com/7.x/thumbs/svg?seed=xander_w&backgroundColor=b6e3f4', flags: {} },
      text: 'the quality keeps getting better honestly',
      kind: 'text',
      delay: 6000,
    },
    {
      author: { name: 'djleaf', avatar: 'https://api.dicebear.com/7.x/thumbs/svg?seed=djleaf&backgroundColor=bae1ff', flags: { member: true } },
      text: 'subscribed!',
      kind: 'text',
      delay: 3200,
    },
    {
      author: { name: 'noodlyboi', avatar: 'https://api.dicebear.com/7.x/thumbs/svg?seed=noodlyboi&backgroundColor=ffd93d', flags: {} },
      text: 'watching at 2am, no regrets',
      kind: 'text',
      delay: 5000,
    },
    {
      author: { name: 'SarahLyn', avatar: 'https://api.dicebear.com/7.x/thumbs/svg?seed=SarahLyn&backgroundColor=ffc9de', flags: {} },
      text: 'this is exactly what i was looking for',
      kind: 'text',
      delay: 4500,
    },
    {
      author: { name: 'returnviewer', avatar: 'https://api.dicebear.com/7.x/thumbs/svg?seed=returnviewer&backgroundColor=c7ceea', flags: { member: true } },
      text: "been here since the beginning, love seeing the growth",
      kind: 'text',
      delay: 7000,
    },
    {
      author: { name: 'coolguy99', avatar: 'https://api.dicebear.com/7.x/thumbs/svg?seed=coolguy99&backgroundColor=c0aede', flags: {} },
      text: 'what software do you use for this?',
      kind: 'text',
      delay: 4200,
    },
    {
      author: { name: 'mattv', avatar: 'https://api.dicebear.com/7.x/thumbs/svg?seed=mattv&backgroundColor=a8e6cf', flags: {} },
      text: 'lol',
      kind: 'text',
      delay: 2500,
    },
    {
      author: { name: 'dragonfly22', avatar: 'https://api.dicebear.com/7.x/thumbs/svg?seed=dragonfly22&backgroundColor=b5ead7', flags: {} },
      text: 'this channel deserves way more subs',
      kind: 'text',
      delay: 5800,
    },
    {
      author: { name: 'JessicaRose', avatar: 'https://api.dicebear.com/7.x/thumbs/svg?seed=JessicaRose&backgroundColor=ffb3ba', flags: {} },
      text: 'love the vibes in here',
      kind: 'text',
      delay: 4000,
    },
    {
      author: { name: 'djleaf', avatar: 'https://api.dicebear.com/7.x/thumbs/svg?seed=djleaf&backgroundColor=bae1ff', flags: { member: true } },
      text: 'can you do a tutorial on this?',
      kind: 'text',
      delay: 5200,
    },
    {
      author: { name: 'noodlyboi', avatar: 'https://api.dicebear.com/7.x/thumbs/svg?seed=noodlyboi&backgroundColor=ffd93d', flags: {} },
      text: 'my favorite stream honestly',
      kind: 'text',
      delay: 6500,
    },
    {
      author: { name: 'returnviewer', avatar: 'https://api.dicebear.com/7.x/thumbs/svg?seed=returnviewer&backgroundColor=c7ceea', flags: { member: true } },
      text: 'just recommended this to my friend lol',
      kind: 'text',
      delay: 4800,
    },
    {
      author: { name: 'xander_w', avatar: 'https://api.dicebear.com/7.x/thumbs/svg?seed=xander_w&backgroundColor=b6e3f4', flags: {} },
      text: 'the chat is so lively tonight',
      kind: 'text',
      delay: 3600,
    },
    {
      author: { name: 'dragonfly22', avatar: 'https://api.dicebear.com/7.x/thumbs/svg?seed=dragonfly22&backgroundColor=b5ead7', flags: {} },
      text: 'where do you usually stream?',
      kind: 'text',
      delay: 5000,
    },
    {
      author: { name: 'coolguy99', avatar: 'https://api.dicebear.com/7.x/thumbs/svg?seed=coolguy99&backgroundColor=c0aede', flags: {} },
      text: 'this is so good',
      kind: 'text',
      delay: 3400,
    },
    {
      author: { name: 'SarahLyn', avatar: 'https://api.dicebear.com/7.x/thumbs/svg?seed=SarahLyn&backgroundColor=ffc9de', flags: {} },
      text: 'watching from work lol',
      kind: 'text',
      delay: 6200,
    },
    {
      author: { name: 'mattv', avatar: 'https://api.dicebear.com/7.x/thumbs/svg?seed=mattv&backgroundColor=a8e6cf', flags: {} },
      text: 'production quality is insane',
      kind: 'text',
      delay: 4700,
    },
    {
      author: { name: 'djleaf', avatar: 'https://api.dicebear.com/7.x/thumbs/svg?seed=djleaf&backgroundColor=bae1ff', flags: { member: true } },
      text: 'been a member for a while now, never disappoints',
      kind: 'text',
      delay: 7500,
    },
    {
      author: { name: 'JessicaRose', avatar: 'https://api.dicebear.com/7.x/thumbs/svg?seed=JessicaRose&backgroundColor=ffb3ba', flags: {} },
      text: 'anyone else watching with their cat lol',
      kind: 'text',
      delay: 5300,
    },
    {
      author: { name: 'noodlyboi', avatar: 'https://api.dicebear.com/7.x/thumbs/svg?seed=noodlyboi&backgroundColor=ffd93d', flags: {} },
      text: 'great stream 👍',
      kind: 'text',
      delay: 4100,
    },
    {
      author: { name: 'dragonfly22', avatar: 'https://api.dicebear.com/7.x/thumbs/svg?seed=dragonfly22&backgroundColor=b5ead7', flags: {} },
      text: 'hi from canada!',
      kind: 'text',
      delay: 5600,
    },
    {
      author: { name: 'returnviewer', avatar: 'https://api.dicebear.com/7.x/thumbs/svg?seed=returnviewer&backgroundColor=c7ceea', flags: { member: true } },
      text: 'every stream is better than the last',
      kind: 'text',
      delay: 6800,
    },
    {
      author: { name: 'xander_w', avatar: 'https://api.dicebear.com/7.x/thumbs/svg?seed=xander_w&backgroundColor=b6e3f4', flags: {} },
      text: 'lol i said the same thing',
      kind: 'text',
      delay: 2900,
    },
    {
      author: { name: 'coolguy99', avatar: 'https://api.dicebear.com/7.x/thumbs/svg?seed=coolguy99&backgroundColor=c0aede', flags: {} },
      text: 'followed!',
      kind: 'text',
      delay: 3700,
    },
    {
      author: { name: 'mattv', avatar: 'https://api.dicebear.com/7.x/thumbs/svg?seed=mattv&backgroundColor=a8e6cf', flags: {} },
      text: 'always here for the live ones',
      kind: 'text',
      delay: 5900,
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
    };
    this.callbacks.onMessage(event);
  }
}
