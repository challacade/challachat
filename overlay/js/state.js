/**
 * ChallaChat Overlay - State Management
 * Application state, constants, presets, and DOM element references
 */

// ================================
// DOM Element References
// ================================

export const elements = {
  messages: document.getElementById('messages'),
  overlay: document.getElementById('overlay'),
  toast: document.getElementById('toast'),
  settings: document.getElementById('settings'),
  settingsBtn: document.getElementById('settingsBtn'),
  soundSettingsBtn: document.getElementById('soundSettingsBtn'),
  musicSettingsBtn: document.getElementById('musicSettingsBtn'),
  scale: document.getElementById('scale'),
  showAvatars: document.getElementById('showAvatars'),
  showBadges: document.getElementById('showBadges'),
  textColor: document.getElementById('textColor'),
  textOpacity: document.getElementById('textOpacity'),
  textColorPreview: document.getElementById('textColorPreview'),
  bubbleColor: document.getElementById('bubbleColor'),
  bubbleColorPreview: document.getElementById('bubbleColorPreview'),
  bgOpacity: document.getElementById('bgOpacity'),
  showBubbles: document.getElementById('showBubbles'),
  demoMode: document.getElementById('demoMode'),
  messageGap: document.getElementById('messageGap'),
  pageBgOpacity: document.getElementById('pageBgOpacity'),
  pageBgColor: document.getElementById('pageBgColor'),
  pageBgColorPreview: document.getElementById('pageBgColorPreview'),
  copyUrlBtn: document.getElementById('copyUrlBtn'),
  msgVolume: document.getElementById('msgVolume'),
  donationVolume: document.getElementById('donationVolume'),
  memberVolume: document.getElementById('memberVolume'),
  testMessageBtn: document.getElementById('testMessageBtn'),
  testDonationBtn: document.getElementById('testDonationBtn'),
  testMemberBtn: document.getElementById('testMemberBtn'),
  clearMessagesBtn: document.getElementById('clearMessagesBtn'),
  generalSettingsBtn: document.getElementById('generalSettingsBtn'),
  generalSettings: document.getElementById('generalSettings'),
  musicSettings: document.getElementById('musicSettings'),
  musicPathDisplay: document.getElementById('musicPathDisplay'),
  musicCurrentTitle: document.getElementById('musicCurrentTitle'),
  musicVolume: document.getElementById('musicVolume'),
  musicPrevBtn: document.getElementById('musicPrevBtn'),
  musicPlayBtn: document.getElementById('musicPlayBtn'),
  musicNextBtn: document.getElementById('musicNextBtn'),
  musicShuffleBtn: document.getElementById('musicShuffleBtn'),
  musicWriteSongFile: document.getElementById('musicWriteSongFile'),
  musicEnableJam: document.getElementById('musicEnableJam'),
  musicSongDisplay: document.getElementById('musicSongDisplay'),
  songDisplayOverlay: document.getElementById('songDisplayOverlay'),
  pollIntervalMs: document.getElementById('pollIntervalMs'),
  censorEnabled: document.getElementById('censorEnabled'),
  censorStatus: document.getElementById('censorStatus'),
  logEnabled: document.getElementById('logEnabled'),
  logStatus: document.getElementById('logStatus')
};

// ================================
// Constants
// ================================

export const SETTINGS_TOGGLE_KEYS = ['Enter', ' ', 'Spacebar', 'Escape', 'Esc'];
export const SOUND_FRESH_MS = 2000;
export const AVATAR_MAX_RETRIES = 3;
export const AVATAR_RETRY_DELAY_MS = 3000;
export const PROXIMITY_DISTANCE = 60;

// ================================
// Presets
// ================================

export const PRESETS = {
  Dark: {
    theme: { text: '#ffffff', textOpacity: 1, bubbleColor: '#ffffff', bgOpacity: 0.14 },
    page: { color: '#000000', opacity: 1 },
    showAvatars: true,
    showBadges: true,
    showBubbles: true,
    messageGapRem: 0.5,
    scale: 1.35
  },
  Light: {
    theme: { text: '#111111', textOpacity: 1, bubbleColor: '#000000', bgOpacity: 0.08 },
    page: { color: '#ffffff', opacity: 1 },
    showAvatars: true,
    showBadges: true,
    showBubbles: true,
    messageGapRem: 0.5,
    scale: 1.35
  },
  Transparent: {
    theme: { text: '#ffffff', textOpacity: 1, bubbleColor: '#ffffff', bgOpacity: 0.14 },
    page: { color: '#000000', opacity: 0 },
    showAvatars: true,
    showBadges: true,
    showBubbles: false,
    messageGapRem: 0.4,
    scale: 1.35
  },
  Custom: null
};

// ================================
// Demo Mode Messages
// ================================

export const DEMO_MESSAGES = [
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
    text: 'Add this page\'s URL as a browser source in your streaming software!',
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
    text: 'Try changing the themes and colors in settings! 🎨',
    kind: 'text'
  },
  {
    author: { 
      name: 'SupportBot',
      avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=SupportBot&backgroundColor=a8e6cf',
      flags: { owner: true }
    },
    text: 'Press Enter or Space to open settings anytime ⚙️',
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
    text: 'Enable sound effects for donations and new members! 🔊',
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
];

// ================================
// Application State
// ================================

export const state = {
  sessionId: 'global',
  apiBase: '',
  scale: 1.35,
  showAvatars: true,
  showBadges: true,
  // Hidden flag: controls rendering of emoji fallback badges (verified/mod/owner) when no image exists
  showEmojiBadges: false,
  theme: { 
    text: '#ffffff', 
    textOpacity: 1,
    bubbleColor: '#000000', 
    bgOpacity: 0.14 
  },
  showBubbles: true,
  messageGapRem: 0.4,
  pageBgColor: '#000000',
  pageBgOpacity: 0,
  byId: new Map(),
  seenIds: new Set(),
  autoScale: 1,
  sounds: {
    message: { volume: 1 },
    donation: { volume: 1 },
    member: { volume: 1 },
  },
  music: {
    volume: 1,
    index: 0,
    writeSongFile: false,
    enableJam: false,
    songDisplay: 'none'  // 'none' | 'top' | 'bottom'
  },
  preset: 'Dark',
  startedAt: null,
  demoMode: false,
  logEnabled: false
};

// ================================
// Utility Functions
// ================================

export function isDemoSite() {
  return window.location.hostname.toLowerCase() === 'demo.challachat.com';
}

export function showToast(message, duration = 1600) {
  if (!elements.toast) return;
  elements.toast.textContent = message;
  elements.toast.classList.add('show');
  elements.toast.classList.remove('hidden');
  setTimeout(() => {
    elements.toast.classList.remove('show');
  }, duration);
}

// ================================
// State Persistence
// ================================

export function saveToLocal() {
  const settingsToSave = {
    scale: state.scale,
    showAvatars: state.showAvatars,
    showBadges: state.showBadges,
    showEmojiBadges: state.showEmojiBadges,
    theme: state.theme,
    showBubbles: state.showBubbles,
    messageGapRem: state.messageGapRem,
    pageBgColor: state.pageBgColor,
    pageBgOpacity: state.pageBgOpacity,
    preset: state.preset || 'Custom',
    demoMode: state.demoMode,
    sounds: state.sounds,
    music: state.music,
    logEnabled: state.logEnabled
  };
  try {
    localStorage.setItem('challachat.settings', JSON.stringify(settingsToSave));
  } catch {}
}
