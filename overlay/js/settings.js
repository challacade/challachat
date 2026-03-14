/**
 * ChallaChat Overlay - Settings
 * Theme application, presets, URL overrides, localStorage persistence,
 * and song-display positioning.
 *
 * All interactive settings UI (HUD buttons, panels, controls) has been
 * moved to the admin panel — this module is purely declarative.
 */

import { state, elements, PRESETS } from './state.js';
import { clamp, hexToRgba } from '/shared/utils.js';

// ================================
// Theme Application
// ================================

export function recomputeAutoScale() {
  const rect = elements.overlay.getBoundingClientRect();
  const baseWidth = 420;
  const baseHeight = 700;
  const scaleFactor = clamp(Math.min(rect.width / baseWidth || 1, rect.height / baseHeight || 1), 0.6, 2.2);
  state.autoScale = scaleFactor;
}

export function applyTheme() {
  const finalScale = state.scale * state.autoScale;

  // Apply text color with opacity
  const textColor = hexToRgba(state.theme.text || '#ffffff', state.theme.textOpacity ?? 1);
  document.documentElement.style.setProperty('--text', textColor);

  // Text shadow (drop-shadow for readability on varied backgrounds)
  const shadowOpacity = state.textShadow ?? 0;
  const shadowValue = shadowOpacity > 0
    ? `0 1px 3px rgba(0,0,0,${shadowOpacity}), 0 0 8px rgba(0,0,0,${(shadowOpacity * 0.6).toFixed(2)})`
    : 'none';
  document.documentElement.style.setProperty('--text-shadow', shadowValue);

  document.documentElement.style.setProperty('--base-scale', String(finalScale));
  document.documentElement.style.setProperty('--message-gap', String(state.messageGapRem));
  document.documentElement.style.setProperty('--edge-padding', (state.edgePadding ?? 0.5) + 'rem');

  const bubbleOpacity = state.showBubbles ? state.theme.bgOpacity : 0;
  const bubbleColor = hexToRgba(state.theme.bubbleColor || '#000000', bubbleOpacity);
  document.documentElement.style.setProperty('--bubble', bubbleColor);
  const hasTexture = state.texture && state.texture !== 'none';
  document.documentElement.style.setProperty('--bubble-blur', (bubbleOpacity > 0 && !hasTexture) ? 'blur(8px)' : 'none');

  const pageBg = hexToRgba(state.pageBgColor || '#000000', state.pageBgOpacity);
  document.body.style.background = pageBg;
  document.documentElement.style.setProperty('--page-bg', pageBg);

  document.documentElement.classList.toggle('no-bubbles', !state.showBubbles);
  document.documentElement.classList.toggle('no-badges', !state.showBadges);

  // Font
  if (state.overlayFont) {
    document.documentElement.style.setProperty('--font', `'${state.overlayFont}', sans-serif`);
  }

  // Message flow
  elements.messages.classList.remove('top-down', 'stack-up', 'stack-down');
  if (state.messageFlow === 'top-down') elements.messages.classList.add('top-down');
  else if (state.messageFlow === 'stack-up') elements.messages.classList.add('stack-up');
  else if (state.messageFlow === 'stack-down') elements.messages.classList.add('stack-down');
  document.documentElement.classList.toggle('no-avatars', !state.showAvatars);

  // Texture
  const overlay = elements.overlay;
  if (overlay) {
    overlay.classList.remove('texture-dots', 'texture-grid', 'texture-stripes', 'texture-crosshatch');
    if (state.texture && state.texture !== 'none') {
      overlay.classList.add(`texture-${state.texture}`);
    }
    overlay.style.setProperty('--texture-intensity', String(state.textureIntensity ?? 0.25));
    overlay.style.setProperty('--texture-scale', String(state.textureScale ?? 1));
    overlay.style.setProperty('--texture-color', state.textureColor || '#ffffff');
    overlay.style.setProperty('--texture-gap', String(state.textureGap ?? 1));
  }
}

// ================================
// Song Display
// ================================

export function applySongDisplay() {
  const overlay = elements.overlay;
  const songEl = elements.songDisplayOverlay;
  const position = state.songDisplay?.position || 'none';

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

  // Apply song text size factor
  const textSize = state.songDisplay?.textSize ?? 1;
  songEl.style.setProperty('--song-text-scale', String(textSize));

  // Apply or remove scrolling
  const scrolling = (state.songDisplay?.scrollSpeed || 0) > 0;
  songEl.classList.toggle('scrolling', scrolling);

  // Update song title
  updateSongDisplayText();
}

export function updateSongDisplayText() {
  const songEl = elements.songDisplayOverlay;
  if (!songEl) return;

  const position = state.songDisplay?.position || 'none';
  if (position === 'none') return;

  const title = state.songDisplay?.songId || '';
  const display = title ? `\u266b ${title} \u266b` : '';
  const textSpan = songEl.querySelector('.song-display-text');
  if (!textSpan) { songEl.textContent = display; return; }

  const scrolling = songEl.classList.contains('scrolling') && !!display;

  if (!scrolling) {
    // Static mode: measure text and auto-truncate with "..." if too wide
    textSpan.textContent = display;
    songEl.style.removeProperty('--marquee-shift');
    songEl.style.removeProperty('--marquee-duration');

    if (display) {
      requestAnimationFrame(() => {
        autoFitSongText(songEl, textSpan, title);
      });
    }
    return;
  }

  // Scrolling mode: two inner spans for seamless loop
  let primary = textSpan.querySelector('.song-primary');
  let secondary = textSpan.querySelector('.song-secondary');
  if (!primary || !secondary) {
    textSpan.textContent = '';
    primary = document.createElement('span');
    primary.className = 'song-primary';
    secondary = document.createElement('span');
    secondary.className = 'song-secondary';
    textSpan.appendChild(primary);
    textSpan.appendChild(secondary);
  }
  primary.textContent = display;
  secondary.textContent = display;

  // Measure after paint so offsetWidth is accurate
  requestAnimationFrame(() => {
    const textWidth = primary.offsetWidth;
    const containerPad = parseFloat(getComputedStyle(songEl).paddingLeft) || 0;
    const buffer = containerPad + 10;
    const gap = Math.max(80, window.innerWidth * 0.25) + buffer;
    const shift = textWidth + gap;
    secondary.style.marginLeft = `${gap}px`;
    songEl.style.setProperty('--marquee-shift', `${shift}px`);
    const baseSpeed = 60;
    const speedMult = state.songDisplay?.scrollSpeed || 1;
    const speed = baseSpeed * speedMult;
    const duration = Math.max(5, shift / speed);
    songEl.style.setProperty('--marquee-duration', `${duration}s`);
    textSpan.style.animation = 'none';
    void textSpan.offsetHeight;
    textSpan.style.animation = '';
  });
}

/**
 * Measures the song text and truncates with "..." if it overflows the container.
 * Uses a binary search on the title length for efficiency.
 */
function autoFitSongText(container, textSpan, title) {
  const style = getComputedStyle(container);
  const padL = parseFloat(style.paddingLeft) || 0;
  const padR = parseFloat(style.paddingRight) || 0;
  const availWidth = container.clientWidth - padL - padR;
  if (textSpan.scrollWidth <= availWidth) return;

  let lo = 0;
  let hi = title.length;
  const wrap = (t) => `\u266b ${t}\u2026 \u266b`;

  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    textSpan.textContent = wrap(title.slice(0, mid));
    if (textSpan.scrollWidth <= availWidth) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }

  if (lo === 0) {
    textSpan.textContent = '\u266b \u2026 \u266b';
  } else if (lo >= title.length) {
    textSpan.textContent = `\u266b ${title} \u266b`;
  } else {
    textSpan.textContent = wrap(title.slice(0, lo).trimEnd());
  }
}

// ================================
// Presets
// ================================

export function applyPreset(name) {
  if (!name || name === 'Custom' || !PRESETS[name]) return;
  const p = PRESETS[name];
  state.theme = {
    text: p.textColor,
    textOpacity: p.textOpacity,
    bubbleColor: p.bubbleColor,
    bgOpacity: p.bubbleOpacity
  };
  state.pageBgColor = p.bgColor;
  state.pageBgOpacity = p.bgOpacity;
  state.showAvatars = !!p.showAvatars;
  state.showBadges = !!p.showBadges;
  state.showBubbles = !!p.showBubbles;
  state.messageGapRem = p.messageGap;
  state.scale = p.scale;
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
  } catch {}
}

export function loadFromUrl() {
  const url = new URL(location.href);
  if (url.searchParams.has('scale')) {
    state.scale = clamp(Number(url.searchParams.get('scale')) || state.scale, 0.5, 3);
  }
  if (url.searchParams.has('preset')) {
    state.preset = url.searchParams.get('preset') || state.preset;
  }
  if (url.searchParams.get('noavatars') === '1') state.showAvatars = false;
  if (url.searchParams.get('nobadges') === '1') state.showBadges = false;
  if (url.searchParams.get('showEmojiBadges') === '1') state.showEmojiBadges = true;
  if (url.searchParams.get('nobubbles') === '1') state.showBubbles = false;
  if (url.searchParams.has('gap')) {
    state.messageGapRem = clamp(Number(url.searchParams.get('gap')), 0, 1.5);
  }
  if (url.searchParams.has('text')) {
    state.theme.text = `#${url.searchParams.get('text')}`.replace('##', '#');
  }
  if (url.searchParams.has('bubble')) {
    state.theme.bubbleColor = `#${url.searchParams.get('bubble')}`.replace('##', '#');
  }
  if (url.searchParams.has('bg')) {
    state.theme.bgOpacity = clamp(Number(url.searchParams.get('bg')), 0, 1);
  }
  if (url.searchParams.has('pagebgcol')) {
    state.pageBgColor = `#${url.searchParams.get('pagebgcol')}`.replace('##', '#');
  }
  if (url.searchParams.has('pagebgop')) {
    state.pageBgOpacity = clamp(Number(url.searchParams.get('pagebgop')), 0, 1);
  }
}
