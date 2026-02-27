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
  songDisplayOverlay: document.getElementById('songDisplayOverlay'),
};

// ================================
// Constants
// ================================

export const AVATAR_MAX_RETRIES = 3;
export const AVATAR_RETRY_DELAY_MS = 3000;

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
  preset: 'Dark',
  startedAt: null,
  demoMode: false,
  songDisplay: {
    position: 'none',  // 'none' | 'top' | 'bottom'
    scrollSpeed: 0,    // 0 = off, 1 = 100% (60px/s), 2 = 200%
    textSize: 1,       // extra scale factor (0–2, where 1 = 100%)
    songId: ''
  }
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
    demoMode: state.demoMode
  };
  try {
    localStorage.setItem('challachat.settings', JSON.stringify(settingsToSave));
  } catch {}
}
