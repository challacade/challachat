/**
 * ChallaChat Overlay - Settings UI
 * Settings panels, UI bindings, poll interval, censor, logger, theme, and persistence
 */

import { state, elements, PRESETS, SETTINGS_TOGGLE_KEYS, PROXIMITY_DISTANCE, isDemoSite, showToast, saveToLocal } from './state.js';
import { clamp01, isValidHexColor, normalizeHexColor, updateColorPreview, setupColorInput } from './utils.js';
import { audio, ensureAudioContext, initializeAudio, playSound } from './audio.js';
import { 
  musicPlayer, applyMusicVolume, getServerIndexAtPos, syncMusicUi, 
  ensureMusicPlaylistLoaded, notifyNowPlaying, toggleJam, requestSongFileWrite,
  musicTogglePlayPause, musicPrev, musicNext, musicShuffle
} from './music.js';
import { startDemoMode, stopDemoMode, clearAllMessages } from './messages.js';

// Re-export saveToLocal for backwards compatibility
export { saveToLocal } from './state.js';

// ================================
// Mouse Detection State
// ================================

let mouseDetectionTimeout = null;
let isMouseDetected = false;
let initialShowTimeout = null;
let clickShowTimeout = null;

export function syncMusicSettingsButtonVisibility() {
  const btn = elements.musicSettingsBtn;
  const panel = elements.musicSettings;
  const enabled = !!musicPlayer?.isConfigured;

  if (!enabled) {
    // Ensure the music UI is not visible or interactable when not configured.
    btn?.classList.remove('show');
    btn?.classList.add('hidden');
    panel?.classList.add('hidden');
    return;
  }

  // Configured: follow the same visibility rules as the other settings buttons.
  if (isMouseDetected) {
    btn?.classList.remove('hidden');
    btn?.classList.add('show');
  } else {
    btn?.classList.remove('show');
    btn?.classList.add('hidden');
  }
}

// ================================
// Mouse Detection Helpers
// ================================

function isMouseNearSettingsButton(mouseX, mouseY) {
  const buttonTop = 12;
  const buttonSize = 48;
  const generalRight = 12;
  const soundRight = 68;
  const appearanceRight = 124;
  const musicRight = 180;
  const generalLeft = window.innerWidth - generalRight - buttonSize;
  const soundLeft = window.innerWidth - soundRight - buttonSize;
  const musicLeft = window.innerWidth - musicRight - buttonSize;
  const appearanceLeft = window.innerWidth - appearanceRight - buttonSize;
  const extendedLeft = Math.min(generalLeft, musicLeft, soundLeft, appearanceLeft) - PROXIMITY_DISTANCE;
  const extendedRight = window.innerWidth - Math.min(generalRight, musicRight, soundRight, appearanceRight) + PROXIMITY_DISTANCE;
  const buttonBottom = buttonTop + buttonSize;
  const proximityZone = {
    left: extendedLeft,
    right: extendedRight,
    top: buttonTop - PROXIMITY_DISTANCE,
    bottom: buttonBottom + PROXIMITY_DISTANCE
  };
  return mouseX >= proximityZone.left && mouseX <= proximityZone.right && mouseY >= proximityZone.top && mouseY <= proximityZone.bottom;
}

function showSettingsButton() {
  if (!isMouseDetected) {
    isMouseDetected = true;
    elements.settingsBtn?.classList.remove('hidden');
    elements.settingsBtn?.classList.add('show');
    elements.soundSettingsBtn?.classList.remove('hidden');
    elements.soundSettingsBtn?.classList.add('show');
    syncMusicSettingsButtonVisibility();
    elements.generalSettingsBtn?.classList.remove('hidden');
    elements.generalSettingsBtn?.classList.add('show');
  }
}

function hideSettingsButton() {
  if (isMouseDetected) {
    isMouseDetected = false;
    elements.settingsBtn?.classList.remove('show');
    elements.soundSettingsBtn?.classList.remove('show');
    elements.musicSettingsBtn?.classList.remove('show');
    elements.generalSettingsBtn?.classList.remove('show');
    setTimeout(() => {
      if (!isMouseDetected) {
        elements.settingsBtn?.classList.add('hidden');
        elements.soundSettingsBtn?.classList.add('hidden');
        // Only keep visible when configured; otherwise ensure hidden.
        syncMusicSettingsButtonVisibility();
        elements.generalSettingsBtn?.classList.add('hidden');
      }
    }, 160);
  }
}

function handleMouseMove(event) {
  const isNearby = isMouseNearSettingsButton(event.clientX, event.clientY);
  if (mouseDetectionTimeout) {
    clearTimeout(mouseDetectionTimeout);
    mouseDetectionTimeout = null;
  }
  if (isNearby) {
    if (!isMouseDetected) {
      showSettingsButton();
    }
    if (clickShowTimeout) {
      clearTimeout(clickShowTimeout);
      clickShowTimeout = null;
    }
    if (initialShowTimeout) {
      clearTimeout(initialShowTimeout);
      initialShowTimeout = null;
    }
  } else {
    if (isMouseDetected && !clickShowTimeout && !initialShowTimeout) {
      hideSettingsButton();
    }
  }
}

function showSettingsButtonInitially() {
  isMouseDetected = true;
  elements.settingsBtn?.classList.remove('hidden');
  elements.settingsBtn?.classList.add('show');
  elements.soundSettingsBtn?.classList.remove('hidden');
  elements.soundSettingsBtn?.classList.add('show');
  syncMusicSettingsButtonVisibility();
  elements.generalSettingsBtn?.classList.remove('hidden');
  elements.generalSettingsBtn?.classList.add('show');
  initialShowTimeout = setTimeout(() => {
    let currentMouseX = window.innerWidth / 2;
    let currentMouseY = window.innerHeight / 2;
    const isNearby = isMouseNearSettingsButton(currentMouseX, currentMouseY);
    if (!isNearby) {
      hideSettingsButton();
    }
    initialShowTimeout = null;
  }, 2000);
}

function showSettingsButtonOnClick(event) {
  if (event.target === elements.settingsBtn || elements.settings?.contains(event.target)) return;
  if (event.target === elements.soundSettingsBtn || document.getElementById('soundSettings')?.contains(event.target)) return;
  if (event.target === elements.musicSettingsBtn || elements.musicSettings?.contains(event.target)) return;
  if (event.target === elements.generalSettingsBtn || elements.generalSettings?.contains(event.target)) return;
  
  if (clickShowTimeout) {
    clearTimeout(clickShowTimeout);
    clickShowTimeout = null;
  }
  if (!isMouseDetected) {
    isMouseDetected = true;
    elements.settingsBtn?.classList.remove('hidden');
    elements.settingsBtn?.classList.add('show');
    elements.soundSettingsBtn?.classList.remove('hidden');
    elements.soundSettingsBtn?.classList.add('show');
    syncMusicSettingsButtonVisibility();
    elements.generalSettingsBtn?.classList.remove('hidden');
    elements.generalSettingsBtn?.classList.add('show');
  }
  clickShowTimeout = setTimeout(() => {
    const isNearby = isMouseNearSettingsButton(event.clientX, event.clientY);
    if (!isNearby) {
      hideSettingsButton();
    }
    clickShowTimeout = null;
  }, 2000);
}

export function setupMouseDetection() {
  showSettingsButtonInitially();
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseout', (event) => {
    if (!event.relatedTarget || event.relatedTarget.nodeName === 'HTML') {
      hideSettingsButton();
    }
  });
  window.addEventListener('mouseleave', () => {
    if (mouseDetectionTimeout) {
      clearTimeout(mouseDetectionTimeout);
      mouseDetectionTimeout = null;
    }
    hideSettingsButton();
  });
  
  elements.settingsBtn?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    elements.settings?.classList.toggle('hidden');
  });
  
  elements.soundSettingsBtn?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const panel = document.getElementById('soundSettings');
    panel?.classList.toggle('hidden');
  });
  
  elements.musicSettingsBtn?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!musicPlayer?.isConfigured) return;
    elements.musicSettings?.classList.toggle('hidden');
    const isHidden = elements.musicSettings?.classList.contains('hidden');
    if (!isHidden) {
      ensureMusicPlaylistLoaded().catch(() => {});
      syncMusicUi();
    }
  });
  
  elements.generalSettingsBtn?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    elements.generalSettings?.classList.toggle('hidden');
  });
  
  window.addEventListener('click', (event) => {
    showSettingsButtonOnClick(event);
  });
}

// ================================
// Theme Application
// ================================

export function recomputeAutoScale() {
  const rect = elements.overlay.getBoundingClientRect();
  const baseWidth = 420;
  const baseHeight = 700;
  const scaleFactor = Math.max(0.6, Math.min(2.2, Math.min(rect.width / baseWidth || 1, rect.height / baseHeight || 1)));
  state.autoScale = scaleFactor;
}

export function applyTheme() {
  const finalScale = state.scale * state.autoScale;
  
  // Apply text color with opacity
  const textHex = (state.theme.text || '#ffffff').replace('#', '');
  const normalizedTextHex = textHex.length === 3 ? textHex.split('').map(c => c + c).join('') : textHex.padEnd(6, '0');
  const tr = parseInt(normalizedTextHex.slice(0, 2), 16);
  const tg = parseInt(normalizedTextHex.slice(2, 4), 16);
  const tb = parseInt(normalizedTextHex.slice(4, 6), 16);
  const textOpacity = Math.max(0, Math.min(1, state.theme.textOpacity || 1));
  const textColor = `rgba(${tr}, ${tg}, ${tb}, ${textOpacity})`;
  document.documentElement.style.setProperty('--text', textColor);
  
  document.documentElement.style.setProperty('--base-scale', String(finalScale));
  document.documentElement.style.setProperty('--message-gap', String(state.messageGapRem));
  
  const hex = (state.theme.bubbleColor || '#000000').replace('#', '');
  const normalizedHex = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex.padEnd(6, '0');
  const r = parseInt(normalizedHex.slice(0, 2), 16);
  const g = parseInt(normalizedHex.slice(2, 4), 16);
  const b = parseInt(normalizedHex.slice(4, 6), 16);
  const bubbleColor = `rgba(${r}, ${g}, ${b}, ${state.showBubbles ? state.theme.bgOpacity : 0})`;
  document.documentElement.style.setProperty('--bubble', bubbleColor);
  
  const bgHex = (state.pageBgColor || '#000000').replace('#', '');
  const normalizedBgHex = bgHex.length === 3 ? bgHex.split('').map(c => c + c).join('') : bgHex.padEnd(6, '0');
  const br = parseInt(normalizedBgHex.slice(0, 2), 16);
  const bg = parseInt(normalizedBgHex.slice(2, 4), 16);
  const bb = parseInt(normalizedBgHex.slice(4, 6), 16);
  const bgOpacity = Math.max(0, Math.min(1, state.pageBgOpacity));
  const pageBg = `rgba(${br}, ${bg}, ${bb}, ${bgOpacity})`;
  document.body.style.background = pageBg;
  document.documentElement.style.setProperty('--page-bg', pageBg);
  
  document.documentElement.classList.toggle('no-bubbles', !state.showBubbles);
  document.documentElement.classList.toggle('no-badges', !state.showBadges);
  document.documentElement.classList.toggle('no-avatars', !state.showAvatars);
}

export function applySongDisplay() {
  const overlay = elements.overlay;
  const songEl = elements.songDisplayOverlay;
  const position = state.music?.songDisplay || 'none';
  
  // Update overlay classes for message gap
  overlay?.classList.remove('song-display-top', 'song-display-bottom');
  
  if (position === 'none' || !songEl) {
    songEl?.classList.add('hidden');
    songEl?.classList.remove('top', 'bottom');
    return;
  }
  
  // Show the song display and position it
  songEl.classList.remove('hidden', 'top', 'bottom');
  songEl.classList.add(position);
  overlay?.classList.add(`song-display-${position}`);
  
  // Apply or remove scrolling
  const scrolling = !!state.music?.scrollSongDisplay;
  songEl.classList.toggle('scrolling', scrolling);
  
  // Update song title from music player
  updateSongDisplayText();
}

export function updateSongDisplayText() {
  const songEl = elements.songDisplayOverlay;
  if (!songEl) return;
  
  const position = state.music?.songDisplay || 'none';
  if (position === 'none') return;
  
  // Import getDisplayTitleAtPos dynamically to avoid circular dependencies
  // The title will be updated whenever syncMusicUi is called
  try {
    const { getDisplayTitleAtPos, musicPlayer } = window.__challaChatMusicExports || {};
    if (getDisplayTitleAtPos && musicPlayer) {
      const title = getDisplayTitleAtPos(musicPlayer.index);
      const display = title ? `♫ ${title} ♫` : '';
      const textSpan = songEl.querySelector('.song-display-text');
      if (textSpan) {
        // For scrolling: duplicate text with a separator for seamless loop
        const scrolling = songEl.classList.contains('scrolling');
        textSpan.textContent = scrolling && display ? `${display}\u2003\u2003\u2003${display}\u2003\u2003\u2003` : display;
        // Scale duration based on text length for consistent speed
        if (scrolling && display) {
          const chars = display.length;
          const duration = Math.max(8, chars * 0.35);
          songEl.style.setProperty('--marquee-duration', `${duration}s`);
        }
      } else {
        songEl.textContent = display;
      }
    }
  } catch {
    // Fallback: will be updated when music module calls this
  }
}

// Register global callback so music.js can call this without circular imports
window.__challaChatUpdateSongDisplay = updateSongDisplayText;

export function applyPreset(name) {
  if (!name || name === 'Custom' || !PRESETS[name]) return;
  const preset = PRESETS[name];
  state.theme = {
    text: preset.theme.text,
    textOpacity: preset.theme.textOpacity,
    bubbleColor: preset.theme.bubbleColor,
    bgOpacity: preset.theme.bgOpacity
  };
  state.pageBgColor = preset.page.color;
  state.pageBgOpacity = preset.page.opacity;
  state.showAvatars = !!preset.showAvatars;
  state.showBadges = !!preset.showBadges;
  state.showBubbles = !!preset.showBubbles;
  state.messageGapRem = preset.messageGapRem;
  state.scale = preset.scale;
}

// ================================
// State Persistence
// ================================

export function loadFromLocal() {
  let settingsString = null;
  try {
    settingsString = localStorage.getItem('challachat.settings');
  } catch {}
  if (!settingsString) return;
  
  try {
    const data = JSON.parse(settingsString);
    if (typeof data.scale === 'number') state.scale = data.scale;
    if (typeof data.showAvatars === 'boolean') state.showAvatars = data.showAvatars;
    if (typeof data.showBadges === 'boolean') state.showBadges = data.showBadges;
    if (typeof data.showEmojiBadges === 'boolean') state.showEmojiBadges = data.showEmojiBadges;
    if (data.theme) {
      state.theme = { ...state.theme, ...data.theme };
      if (typeof state.theme.textOpacity !== 'number') state.theme.textOpacity = 1;
    }
    if (typeof data.pageBgColor === 'string') state.pageBgColor = data.pageBgColor;
    if (typeof data.pageBgOpacity === 'number') state.pageBgOpacity = data.pageBgOpacity;
    if (typeof data.showBubbles === 'boolean') state.showBubbles = data.showBubbles;
    if (typeof data.messageGapRem === 'number') state.messageGapRem = data.messageGapRem;
    if (typeof data.preset === 'string') state.preset = data.preset;
    if (data.sounds && typeof data.sounds === 'object') {
      state.sounds = { ...state.sounds, ...data.sounds };
    }
    if (data.music && typeof data.music === 'object') {
      state.music = { ...state.music, ...data.music };
    }
    if (typeof data.demoMode === 'boolean') state.demoMode = data.demoMode;
    if (typeof data.logEnabled === 'boolean') state.logEnabled = data.logEnabled;
  } catch {}
}

export function loadFromUrl() {
  const url = new URL(location.href);
  if (url.searchParams.has('scale')) {
    state.scale = Math.max(0.5, Math.min(3, Number(url.searchParams.get('scale')) || state.scale));
  }
  if (url.searchParams.has('preset')) {
    state.preset = url.searchParams.get('preset') || state.preset;
  }
  if (url.searchParams.get('noavatars') === '1') state.showAvatars = false;
  if (url.searchParams.get('nobadges') === '1') state.showBadges = false;
  if (url.searchParams.get('showEmojiBadges') === '1') state.showEmojiBadges = true;
  if (url.searchParams.get('nobubbles') === '1') state.showBubbles = false;
  if (url.searchParams.has('gap')) {
    state.messageGapRem = Math.max(0, Math.min(1.5, Number(url.searchParams.get('gap'))));
  }
  if (url.searchParams.has('text')) {
    state.theme.text = `#${url.searchParams.get('text')}`.replace('##', '#');
  }
  if (url.searchParams.has('bubble')) {
    state.theme.bubbleColor = `#${url.searchParams.get('bubble')}`.replace('##', '#');
  }
  if (url.searchParams.has('bg')) {
    state.theme.bgOpacity = Math.max(0, Math.min(1, Number(url.searchParams.get('bg'))));
  }
  if (url.searchParams.has('pagebgcol')) {
    state.pageBgColor = `#${url.searchParams.get('pagebgcol')}`.replace('##', '#');
  }
  if (url.searchParams.has('pagebgop')) {
    state.pageBgOpacity = Math.max(0, Math.min(1, Number(url.searchParams.get('pagebgop'))));
  }
  if (url.searchParams.has('songdisplay')) {
    const val = url.searchParams.get('songdisplay');
    if (['none', 'top', 'bottom'].includes(val)) state.music.songDisplay = val;
  }
}

// ================================
// UI Sync
// ================================

export function syncUi() {
  elements.scale.value = String(state.scale);
  if (elements.showAvatars) elements.showAvatars.checked = state.showAvatars;
  if (elements.showBadges) elements.showBadges.checked = state.showBadges;
  
  const presetElement = document.getElementById('preset');
  if (presetElement) presetElement.value = state.preset || 'Custom';
  
  // Set hex color values and update previews
  elements.textColor.value = normalizeHexColor(state.theme.text);
  if (elements.textOpacity) elements.textOpacity.value = String(state.theme.textOpacity || 1);
  updateColorPreview(elements.textColor, elements.textColorPreview);
  
  if (elements.bubbleColor) {
    elements.bubbleColor.value = normalizeHexColor(state.theme.bubbleColor || '#000000');
    updateColorPreview(elements.bubbleColor, elements.bubbleColorPreview);
  }
  
  if (elements.pageBgColor) {
    elements.pageBgColor.value = normalizeHexColor(state.pageBgColor || '#000000');
    updateColorPreview(elements.pageBgColor, elements.pageBgColorPreview);
  }
  
  elements.bgOpacity.value = String(state.theme.bgOpacity);
  if (elements.showBubbles) elements.showBubbles.checked = state.showBubbles;
  if (elements.demoMode) elements.demoMode.checked = state.demoMode;
  if (elements.messageGap) elements.messageGap.value = String(state.messageGapRem);
  if (elements.pageBgOpacity) elements.pageBgOpacity.value = String(state.pageBgOpacity);
  
  // Sound panel
  if (elements.msgVolume) elements.msgVolume.value = String(state.sounds.message.volume);
  if (elements.donationVolume) elements.donationVolume.value = String(state.sounds.donation.volume);
  if (elements.memberVolume) elements.memberVolume.value = String(state.sounds.member.volume);
  
  // Music panel
  if (elements.musicVolume) elements.musicVolume.value = String(clamp01(state.music.volume));
  if (elements.musicWriteSongFile) elements.musicWriteSongFile.checked = !!state.music.writeSongFile;
  if (elements.musicEnableJam) elements.musicEnableJam.checked = !!state.music.enableJam;
  if (elements.musicSongDisplay) elements.musicSongDisplay.value = state.music.songDisplay || 'none';
  if (elements.scrollSongDisplay) elements.scrollSongDisplay.checked = !!state.music.scrollSongDisplay;
  
  applySongDisplay();
  applyTheme();
  
  // Keep custom dropdown label/selection in sync
  try { syncCustomPresetDropdown(); } catch {}
  try { syncSongDisplayDropdown(); } catch {}
}

export function updateFromUi() {
  state.scale = Math.max(0.5, Math.min(3, Number(elements.scale.value) || 1.35));
  if (elements.showAvatars) state.showAvatars = elements.showAvatars.checked;
  if (elements.showBadges) state.showBadges = elements.showBadges.checked;
  state.preset = 'Custom';
  
  // Update colors from hex inputs
  if (isValidHexColor(elements.textColor.value)) {
    state.theme.text = normalizeHexColor(elements.textColor.value);
  }
  if (elements.textOpacity) state.theme.textOpacity = Math.max(0, Math.min(1, Number(elements.textOpacity.value) || 1));
  
  if (elements.bubbleColor && isValidHexColor(elements.bubbleColor.value)) {
    state.theme.bubbleColor = normalizeHexColor(elements.bubbleColor.value);
  }
  
  if (elements.pageBgColor && isValidHexColor(elements.pageBgColor.value)) {
    state.pageBgColor = normalizeHexColor(elements.pageBgColor.value);
  }
  
  state.theme.bgOpacity = Math.max(0, Math.min(1, Number(elements.bgOpacity.value)));
  if (elements.showBubbles) state.showBubbles = elements.showBubbles.checked;
  
  if (elements.demoMode) {
    const newDemoMode = elements.demoMode.checked;
    if (newDemoMode !== state.demoMode) {
      state.demoMode = newDemoMode;
      if (state.demoMode) {
        startDemoMode();
      } else {
        stopDemoMode();
      }
    }
  }
  
  if (elements.messageGap) {
    state.messageGapRem = Math.max(0, Math.min(1.5, Number(elements.messageGap.value)));
  }
  if (elements.pageBgOpacity) {
    state.pageBgOpacity = Math.max(0, Math.min(1, Number(elements.pageBgOpacity.value)));
  }
  
  // Per-sound volumes only (set to 0 to disable)
  if (elements.msgVolume) state.sounds.message.volume = Math.max(0, Math.min(2, Number(elements.msgVolume.value)));
  if (elements.donationVolume) state.sounds.donation.volume = Math.max(0, Math.min(2, Number(elements.donationVolume.value)));
  if (elements.memberVolume) state.sounds.member.volume = Math.max(0, Math.min(2, Number(elements.memberVolume.value)));
  
  // Music volume (HTMLAudioElement: 0..1)
  if (elements.musicVolume) state.music.volume = clamp01(Number(elements.musicVolume.value));

  const prevWriteSongFile = !!state.music.writeSongFile;
  if (elements.musicWriteSongFile) state.music.writeSongFile = !!elements.musicWriteSongFile.checked;
  if (!prevWriteSongFile && state.music.writeSongFile) {
    requestSongFileWrite({ force: true });
  }

  const prevEnableJam = !!state.music.enableJam;
  if (elements.musicEnableJam) state.music.enableJam = !!elements.musicEnableJam.checked;
  if (prevEnableJam !== !!state.music.enableJam) {
    void toggleJam(!!state.music.enableJam);
    // If enabling while music is already playing, push current track to server.
    if (state.music.enableJam) {
      try { void notifyNowPlaying(getServerIndexAtPos(musicPlayer.index)); } catch {}
    }
  }

  // Song display setting
  if (elements.musicSongDisplay) {
    state.music.songDisplay = elements.musicSongDisplay.value || 'none';
  }
  if (elements.scrollSongDisplay) {
    state.music.scrollSongDisplay = !!elements.scrollSongDisplay.checked;
  }
  applySongDisplay();

  applyMusicVolume();
  applyTheme();
  saveToLocal();
}

// ================================
// Poll Interval Controls
// ================================

let lastCommittedPollInterval = null;

function setPollIntervalInputDisabled(disabled) {
  const input = elements.pollIntervalMs;
  if (!input) return;
  input.disabled = !!disabled;
}

export async function fetchPollIntervalFromServer() {
  const input = elements.pollIntervalMs;
  if (!input) return;
  try {
    const resp = await fetch('/api/poll-interval', { cache: 'no-store' });
    if (!resp.ok) throw new Error('HTTP error');
    const data = await resp.json();
    const value = Number(data?.pollIntervalMs) || 1000;
    lastCommittedPollInterval = value;
    input.value = String(value);
  } catch {}
}

function setupPollIntervalControls() {
  const input = elements.pollIntervalMs;
  if (!input) return;
  
  const postUpdate = async (ms) => {
    try {
      setPollIntervalInputDisabled(true);
      const resp = await fetch('/api/poll-interval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pollIntervalMs: ms })
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.error) {
        showToast('Failed to set poll interval');
        return;
      }
      const applied = Number(data?.pollIntervalMs) || ms;
      input.value = String(applied);
      lastCommittedPollInterval = applied;
      showToast(`Poll interval: ${applied} ms`);
    } catch {
      showToast('Failed to set poll interval');
    } finally {
      setPollIntervalInputDisabled(false);
    }
  };
  
  const commitIfChanged = () => {
    const raw = Number(input.value);
    if (!Number.isFinite(raw)) return;
    const clamped = Math.max(100, Math.round(raw));
    if (clamped === lastCommittedPollInterval) return;
    postUpdate(clamped);
  };
  
  input.addEventListener('blur', commitIfChanged);
  input.addEventListener('change', commitIfChanged);
  
  const observer = new MutationObserver(() => {
    const panel = elements.generalSettings;
    if (!panel) return;
    const hidden = panel.classList.contains('hidden');
    if (hidden) {
      commitIfChanged();
    }
  });
  observer.observe(elements.generalSettings, { attributes: true, attributeFilter: ['class'] });
}

// ================================
// Censor Filter Controls
// ================================

let censorFilterState = { loaded: false, active: true, wordCount: 0, path: null };

function updateCensorStatusUI() {
  const checkbox = elements.censorEnabled;
  const statusEl = elements.censorStatus;
  if (!checkbox || !statusEl) return;
  
  checkbox.checked = censorFilterState.active;
  
  if (!censorFilterState.loaded) {
    statusEl.textContent = 'No censor.csv found';
    statusEl.classList.remove('hidden');
    statusEl.classList.add('warning');
  } else {
    statusEl.textContent = `${censorFilterState.wordCount} words loaded`;
    statusEl.classList.remove('hidden', 'warning');
  }
}

export async function fetchCensorFilterStatus() {
  if (isDemoSite()) return;
  try {
    const resp = await fetch('/api/filter', { cache: 'no-store' });
    if (!resp.ok) throw new Error('HTTP error');
    const data = await resp.json();
    censorFilterState = {
      loaded: !!data.loaded,
      active: !!data.active,
      wordCount: data.wordCount || 0,
      path: data.path || null
    };
    updateCensorStatusUI();
  } catch {}
}

async function toggleCensorFilter(active) {
  if (isDemoSite()) return;
  try {
    if (active) {
      await fetch('/api/filter/reload', { method: 'POST' });
    }
    
    const resp = await fetch('/api/filter/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active })
    });
    const data = await resp.json().catch(() => ({}));
    if (resp.ok) {
      censorFilterState = {
        loaded: !!data.loaded,
        active: !!data.active,
        wordCount: data.wordCount || 0,
        path: data.path || null
      };
      updateCensorStatusUI();
      showToast(active ? 'Censor filter enabled' : 'Censor filter disabled');
    }
  } catch {
    showToast('Failed to toggle censor filter');
  }
}

function setupCensorFilterControls() {
  const checkbox = elements.censorEnabled;
  if (!checkbox) return;
  
  checkbox.addEventListener('change', () => {
    toggleCensorFilter(checkbox.checked);
  });
}

// ================================
// Message Logger Controls
// ================================

let loggerState = { enabled: false, logging: false, messageCount: 0, path: null, logsDir: null };

function updateLogStatusUI() {
  const checkbox = elements.logEnabled;
  const statusEl = elements.logStatus;
  if (!checkbox || !statusEl) return;
  
  checkbox.checked = loggerState.enabled;
  
  if (loggerState.enabled) {
    if (loggerState.logging) {
      statusEl.textContent = `Logging (${loggerState.messageCount} msgs)`;
      statusEl.classList.remove('hidden', 'warning');
    } else {
      statusEl.textContent = 'Waiting for capture...';
      statusEl.classList.remove('hidden');
      statusEl.classList.add('warning');
    }
  } else {
    statusEl.textContent = '';
    statusEl.classList.add('hidden');
  }
}

export async function fetchLoggerStatus() {
  if (isDemoSite()) return;
  try {
    const resp = await fetch('/api/logger', { cache: 'no-store' });
    if (!resp.ok) throw new Error('HTTP error');
    const data = await resp.json();
    loggerState = {
      enabled: !!data.enabled,
      logging: !!data.logging,
      messageCount: data.messageCount || 0,
      path: data.path || null,
      logsDir: data.logsDir || null
    };
    updateLogStatusUI();
  } catch {}
}

export async function toggleLogger(enabled) {
  if (isDemoSite()) return;
  try {
    const resp = await fetch('/api/logger/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled })
    });
    const data = await resp.json().catch(() => ({}));
    if (resp.ok) {
      loggerState = {
        enabled: !!data.enabled,
        logging: !!data.logging,
        messageCount: data.messageCount || 0,
        path: data.path || null,
        logsDir: data.logsDir || null
      };
      state.logEnabled = !!data.enabled;
      saveToLocal();
      updateLogStatusUI();
      showToast(enabled ? 'Message logging enabled' : 'Message logging disabled');
    }
  } catch {
    showToast('Failed to toggle logger');
  }
}

function setupLoggerControls() {
  const checkbox = elements.logEnabled;
  if (!checkbox) return;
  
  checkbox.addEventListener('change', () => {
    toggleLogger(checkbox.checked);
  });
}

// ================================
// URL Copy
// ================================

export function copyUrlWithSettings() {
  const baseUrl = new URL('/', location.origin);
  const params = baseUrl.searchParams;
  params.set('scale', String(state.scale));
  if (state.preset && state.preset !== 'Custom') {
    params.set('preset', state.preset);
  }
  if (!state.showAvatars) params.set('noavatars', '1');
  if (!state.showBadges) params.set('nobadges', '1');
  if (!state.showBubbles) params.set('nobubbles', '1');
  if (state.messageGapRem !== 0.4) {
    params.set('gap', String(state.messageGapRem));
  }
  if (state.pageBgColor) {
    params.set('pagebgcol', state.pageBgColor.replace('#', ''));
  }
  if (typeof state.pageBgOpacity === 'number') {
    params.set('pagebgop', String(state.pageBgOpacity));
  }
  params.set('text', state.theme.text.replace('#', ''));
  params.set('bubble', state.theme.bubbleColor.replace('#', ''));
  params.set('bg', String(state.theme.bgOpacity));
  if (state.music.songDisplay && state.music.songDisplay !== 'none') {
    params.set('songdisplay', state.music.songDisplay);
  }
  
  try {
    navigator.clipboard.writeText(baseUrl.toString())
      .then(() => showToast('URL copied'))
      .catch(() => showToast('Copy failed'));
  } catch {
    showToast('Copy failed');
  }
}

// ================================
// Custom Dropdown (reusable)
// ================================

function buildCustomSelect(selectId, mountId) {
  const select = document.getElementById(selectId);
  const mount = document.getElementById(mountId);
  if (!select || !mount) return;

  mount.innerHTML = '';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'select-custom__button';
  const labelSpan = document.createElement('span');
  labelSpan.className = 'select-custom__label';
  labelSpan.textContent = select.options[select.selectedIndex]?.text || select.value || 'Select';
  const chevron = document.createElement('span');
  chevron.className = 'select-custom__chevron';
  chevron.textContent = '▾';
  button.append(labelSpan, chevron);

  const menu = document.createElement('ul');
  menu.className = 'select-custom__menu';
  menu.role = 'listbox';
  menu.tabIndex = -1;

  const options = Array.from(select.options).map((opt, idx) => {
    const li = document.createElement('li');
    li.className = 'select-custom__option';
    li.role = 'option';
    li.tabIndex = -1;
    li.dataset.value = opt.value;
    li.textContent = opt.text;
    if (opt.value === select.value) {
      li.setAttribute('aria-selected', 'true');
    }
    li.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      commitSelection(opt.value, opt.text);
      closeMenu();
      button.focus();
    });
    return li;
  });
  options.forEach((li) => menu.appendChild(li));

  let open = false;
  let activeIndex = options.findIndex((li) => li.getAttribute('aria-selected') === 'true');
  if (activeIndex < 0) activeIndex = 0;

  const openMenu = () => {
    if (open) return;
    menu.classList.add('open');
    open = true;
    const target = options[activeIndex] || options[0];
    if (target) target.focus();
    document.addEventListener('pointerdown', onDocDown, { capture: true });
    document.addEventListener('keydown', onDocKey);
  };
  
  const closeMenu = () => {
    if (!open) return;
    menu.classList.remove('open');
    open = false;
    document.removeEventListener('pointerdown', onDocDown, { capture: true });
    document.removeEventListener('keydown', onDocKey);
  };
  
  const onDocDown = (e) => {
    if (!mount.contains(e.target)) closeMenu();
  };
  
  const onDocKey = (e) => {
    if (!open) return;
    if (e.key === 'Escape' || e.key === 'Esc') {
      e.preventDefault();
      closeMenu();
      button.focus();
      return;
    }
    const max = options.length - 1;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = Math.min(max, activeIndex + 1);
      options[activeIndex]?.focus();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = Math.max(0, activeIndex - 1);
      options[activeIndex]?.focus();
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const el = options[activeIndex];
      if (el) {
        const val = el.dataset.value || '';
        const text = el.textContent || val;
        commitSelection(val, text);
      }
      closeMenu();
      button.focus();
      return;
    }
  };
  
  const commitSelection = (value, text) => {
    if (select.value !== value) {
      select.value = value;
      select.dispatchEvent(new Event('change'));
    }
    labelSpan.textContent = text || value;
    options.forEach((el, i) => {
      if (el.dataset.value === value) {
        el.setAttribute('aria-selected', 'true');
        activeIndex = i;
      } else {
        el.removeAttribute('aria-selected');
      }
    });
  };

  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    open ? closeMenu() : openMenu();
  });
  
  button.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      openMenu();
    }
  });

  mount.appendChild(button);
  mount.appendChild(menu);
}

function syncCustomSelect(selectId, mountId) {
  const select = document.getElementById(selectId);
  const label = document.querySelector(`#${mountId} .select-custom__label`);
  const options = document.querySelectorAll(`#${mountId} .select-custom__option`);
  if (!select || !label || !options.length) return;
  const currentText = select.options[select.selectedIndex]?.text || select.value;
  label.textContent = currentText;
  options.forEach((el) => {
    if (el.dataset.value === select.value) el.setAttribute('aria-selected', 'true');
    else el.removeAttribute('aria-selected');
  });
}

export function buildCustomPresetDropdown() {
  buildCustomSelect('preset', 'presetSelect');
}

export function syncCustomPresetDropdown() {
  try { syncCustomSelect('preset', 'presetSelect'); } catch {}
}

export function buildSongDisplayDropdown() {
  buildCustomSelect('musicSongDisplay', 'songDisplaySelect');
}

export function syncSongDisplayDropdown() {
  try { syncCustomSelect('musicSongDisplay', 'songDisplaySelect'); } catch {}
}

// ================================
// UI Event Bindings
// ================================

function shouldIgnoreKeyEvent(event) {
  const target = event.target;
  if (!target) return false;
  const tag = (target.tagName || '').toUpperCase();
  if (target.isContentEditable) return true;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON';
}

export { isMouseNearSettingsButton, showSettingsButton, hideSettingsButton, mouseDetectionTimeout };

export function bindUi() {
  // Keyboard toggle for Appearance settings
  window.addEventListener('keydown', (event) => {
    if (event.defaultPrevented) return;
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    if (shouldIgnoreKeyEvent(event)) return;
    if (SETTINGS_TOGGLE_KEYS.includes(event.key)) {
      event.preventDefault();
      const hidden = elements.settings.classList.contains('hidden');
      elements.settings.classList.toggle('hidden');
      if (hidden) {
        showSettingsButton();
        if (mouseDetectionTimeout) {
          clearTimeout(mouseDetectionTimeout);
        }
        mouseDetectionTimeout = setTimeout(() => {
          if (elements.settings.classList.contains('hidden')) {
            hideSettingsButton();
          }
        }, 3000);
      }
    }
  });
  
  // Close panels on outside click
  window.addEventListener('pointerdown', (event) => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    
    // Appearance
    const settingsPanel = elements.settings;
    if (settingsPanel && !settingsPanel.classList.contains('hidden')) {
      if (!settingsPanel.contains(target) && target !== elements.settingsBtn) {
        settingsPanel.classList.add('hidden');
        if (event.clientX !== undefined && event.clientY !== undefined) {
          const nearby = isMouseNearSettingsButton(event.clientX, event.clientY);
          if (!nearby) hideSettingsButton();
        }
      }
    }
    
    // Sound
    const soundPanel = document.getElementById('soundSettings');
    if (soundPanel && !soundPanel.classList.contains('hidden')) {
      if (!soundPanel.contains(target) && target !== elements.soundSettingsBtn) {
        soundPanel.classList.add('hidden');
      }
    }
    
    // Music
    const musicPanel = elements.musicSettings;
    if (musicPanel && !musicPanel.classList.contains('hidden')) {
      if (!musicPanel.contains(target) && target !== elements.musicSettingsBtn) {
        musicPanel.classList.add('hidden');
      }
    }
    
    // General
    const generalPanel = elements.generalSettings;
    if (generalPanel && !generalPanel.classList.contains('hidden')) {
      if (!generalPanel.contains(target) && target !== elements.generalSettingsBtn) {
        generalPanel.classList.add('hidden');
      }
    }
  });
  
  // Setup color inputs with previews
  setupColorInput(elements.textColor, elements.textColorPreview);
  setupColorInput(elements.bubbleColor, elements.bubbleColorPreview);
  setupColorInput(elements.pageBgColor, elements.pageBgColorPreview);
  
  // Basic controls
  elements.copyUrlBtn?.addEventListener('click', () => copyUrlWithSettings());
  elements.showBubbles?.addEventListener('change', updateFromUi);
  elements.demoMode?.addEventListener('change', updateFromUi);
  elements.showBadges?.addEventListener('change', updateFromUi);
  elements.showAvatars?.addEventListener('change', updateFromUi);
  elements.messageGap?.addEventListener('input', updateFromUi);
  elements.pageBgColor?.addEventListener('input', updateFromUi);
  elements.pageBgOpacity?.addEventListener('input', updateFromUi);
  elements.textColor?.addEventListener('input', updateFromUi);
  elements.textOpacity?.addEventListener('input', updateFromUi);
  elements.bubbleColor?.addEventListener('input', updateFromUi);
  elements.bgOpacity?.addEventListener('input', updateFromUi);
  elements.scale?.addEventListener('input', updateFromUi);
  
  const presetEl = document.getElementById('preset');
  if (presetEl) {
    presetEl.addEventListener('change', () => {
      state.preset = presetEl.value || 'Custom';
      applyPreset(state.preset);
      syncUi();
      saveToLocal();
      showToast(`${state.preset} preset applied`);
    });
  }
  
  elements.clearMessagesBtn?.addEventListener('click', () => clearAllMessages());
  
  // Per-sound volumes
  elements.msgVolume?.addEventListener('input', updateFromUi);
  elements.donationVolume?.addEventListener('input', updateFromUi);
  elements.memberVolume?.addEventListener('input', updateFromUi);
  
  // Music volume
  elements.musicVolume?.addEventListener('input', updateFromUi);
  elements.musicWriteSongFile?.addEventListener('change', updateFromUi);
  elements.musicEnableJam?.addEventListener('change', updateFromUi);
  elements.musicSongDisplay?.addEventListener('change', updateFromUi);
  elements.scrollSongDisplay?.addEventListener('change', updateFromUi);
  
  // Poll interval controls
  setupPollIntervalControls();
  
  // Censor filter controls
  setupCensorFilterControls();
  
  // Logger controls
  setupLoggerControls();
  
  // Per-sound Test buttons
  elements.testMessageBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    ensureAudioContext();
    if (!audio.message) {
      await initializeAudio();
    }
    playSound(audio.message, state.sounds.message.volume);
    showToast('Test: message');
  });
  
  elements.testDonationBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    ensureAudioContext();
    if (!audio.donation) {
      await initializeAudio();
    }
    playSound(audio.donation, state.sounds.donation.volume);
    showToast('Test: donation');
  });
  
  elements.testMemberBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    ensureAudioContext();
    if (!audio.member) {
      await initializeAudio();
    }
    playSound(audio.member, state.sounds.member.volume);
    showToast('Test: membership');
  });

  // Music controls
  elements.musicPlayBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    void musicTogglePlayPause();
  });

  elements.musicPrevBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    void musicPrev();
  });

  elements.musicNextBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    void musicNext();
  });

  elements.musicShuffleBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    void musicShuffle();
  });
}
