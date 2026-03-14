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

import { PRESETS as _SHARED_PRESETS } from '/shared/presets.js';
export const PRESETS = { ..._SHARED_PRESETS, Custom: null };

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
  texture: 'none',
  textureIntensity: 0.25,
  textureScale: 1,
  textureGap: 1,
  textureColor: '#ffffff',
  overlayFont: 'Inter',
  messageFlow: 'bottom-up',
  edgePadding: 0.5,
  textShadow: 0.25,
  preset: 'Dark',
  startedAt: null,
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
    preset: state.preset || 'Custom'
  };
  try {
    localStorage.setItem('challachat.settings', JSON.stringify(settingsToSave));
  } catch {}
}
