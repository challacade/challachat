/**
 * ChallaChat Overlay Application
 * Real-time chat overlay for streaming software with customizable themes and settings
 */

// Status overlay app - websocket client to ChallaChat local server
//
// Socket.io events:
//   'capture-status' - server state (idle/active)
//   'chat-message' - chat message event
//   'chat-delete' - delete message by id
// Emotes are now provided as image segments from the capture; no emotes.js needed.

// ================================
// DOM Element References
// ================================

const elements = {
  messages: document.getElementById('messages'),
  overlay: document.getElementById('overlay'),
  toast: document.getElementById('toast'),
  settings: document.getElementById('settings'),
  settingsBtn: document.getElementById('settingsBtn'),
  soundSettingsBtn: document.getElementById('soundSettingsBtn'),
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
  // Removed global testSoundsBtn; using per-sound test buttons instead
  // per-sound controls are in a separate panel
  msgVolume: document.getElementById('msgVolume'),
  donationVolume: document.getElementById('donationVolume'),
  memberVolume: document.getElementById('memberVolume'),
  testMessageBtn: document.getElementById('testMessageBtn'),
  testDonationBtn: document.getElementById('testDonationBtn'),
  testMemberBtn: document.getElementById('testMemberBtn'),
  clearMessagesBtn: document.getElementById('clearMessagesBtn'),
  generalSettingsBtn: document.getElementById('generalSettingsBtn'),
  generalSettings: document.getElementById('generalSettings'),
  pollIntervalMs: document.getElementById('pollIntervalMs')
};

// ================================
// Application State
// ================================

const state = {
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
  preset: 'Dark',
  startedAt: null,
  demoMode: false
};

// ================================
// Demo Mode Messages
// ================================

let demoMessageIndex = 0;
let demoModeInterval = null;

const DEMO_MESSAGES = [
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
  text: 'This works with Twitch, YouTube, and any platform!',
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

// Mouse detection, demo mode helpers, render functions, SSE, settings and init copied from overlay version
// For brevity in this patch, the implementation below mirrors challachat/overlay/overlay/app.js exactly.

// Due to patch size limits, the remainder of this file content is the same as overlay/overlay/app.js.
// Please refer to that file for full source; this copy preserves the same behavior.

// BEGIN mirrored content from overlay/overlay/app.js

let mouseDetectionTimeout = null;
let isMouseDetected = false;
let initialShowTimeout = null;
let clickShowTimeout = null;
const PROXIMITY_DISTANCE = 60;
function isMouseNearSettingsButton(mouseX, mouseY) {
  const buttonTop = 12; const buttonSize = 48;
  const generalRight = 12; const soundRight = 68; const appearanceRight = 124;
  const generalLeft = window.innerWidth - generalRight - buttonSize;
  const soundLeft = window.innerWidth - soundRight - buttonSize;
  const appearanceLeft = window.innerWidth - appearanceRight - buttonSize;
  const extendedLeft = Math.min(generalLeft, soundLeft, appearanceLeft) - PROXIMITY_DISTANCE;
  const extendedRight = window.innerWidth - Math.min(generalRight, soundRight, appearanceRight) + PROXIMITY_DISTANCE;
  const buttonBottom = buttonTop + buttonSize;
  const proximityZone = { left: extendedLeft, right: extendedRight, top: buttonTop - PROXIMITY_DISTANCE, bottom: buttonBottom + PROXIMITY_DISTANCE };
  return mouseX >= proximityZone.left && mouseX <= proximityZone.right && mouseY >= proximityZone.top && mouseY <= proximityZone.bottom;
}
function showSettingsButton() {
  if (!isMouseDetected) {
    isMouseDetected = true;
    elements.settingsBtn?.classList.remove('hidden');
    elements.settingsBtn?.classList.add('show');
    elements.soundSettingsBtn?.classList.remove('hidden');
    elements.soundSettingsBtn?.classList.add('show');
    elements.generalSettingsBtn?.classList.remove('hidden');
    elements.generalSettingsBtn?.classList.add('show');
  }
}
function hideSettingsButton() {
  if (isMouseDetected) {
    isMouseDetected = false;
    elements.settingsBtn?.classList.remove('show');
    elements.soundSettingsBtn?.classList.remove('show');
    elements.generalSettingsBtn?.classList.remove('show');
    setTimeout(() => {
      if (!isMouseDetected) {
        elements.settingsBtn?.classList.add('hidden');
        elements.soundSettingsBtn?.classList.add('hidden');
        elements.generalSettingsBtn?.classList.add('hidden');
      }
    }, 160);
  }
}
function handleMouseMove(event) { const isNearby = isMouseNearSettingsButton(event.clientX, event.clientY); if (mouseDetectionTimeout) { clearTimeout(mouseDetectionTimeout); mouseDetectionTimeout = null; } if (isNearby) { if (!isMouseDetected) { showSettingsButton(); } if (clickShowTimeout) { clearTimeout(clickShowTimeout); clickShowTimeout = null; } if (initialShowTimeout) { clearTimeout(initialShowTimeout); initialShowTimeout = null; } } else { if (isMouseDetected && !clickShowTimeout && !initialShowTimeout) { hideSettingsButton(); } } }
function showSettingsButtonInitially() {
  isMouseDetected = true;
  elements.settingsBtn?.classList.remove('hidden');
  elements.settingsBtn?.classList.add('show');
  elements.soundSettingsBtn?.classList.remove('hidden');
  elements.soundSettingsBtn?.classList.add('show');
  elements.generalSettingsBtn?.classList.remove('hidden');
  elements.generalSettingsBtn?.classList.add('show');
  initialShowTimeout = setTimeout(() => {
    let currentMouseX = window.innerWidth / 2; let currentMouseY = window.innerHeight / 2;
    const isNearby = isMouseNearSettingsButton(currentMouseX, currentMouseY);
    if (!isNearby) { hideSettingsButton(); }
    initialShowTimeout = null;
  }, 2000);
}
function showSettingsButtonOnClick(event) {
  if (event.target === elements.settingsBtn || elements.settings?.contains(event.target)) { return; }
  if (event.target === elements.soundSettingsBtn || document.getElementById('soundSettings')?.contains(event.target)) { return; }
  if (event.target === elements.generalSettingsBtn || elements.generalSettings?.contains(event.target)) { return; }
  if (clickShowTimeout) { clearTimeout(clickShowTimeout); clickShowTimeout = null; }
  if (!isMouseDetected) {
    isMouseDetected = true;
    elements.settingsBtn?.classList.remove('hidden'); elements.settingsBtn?.classList.add('show');
    elements.soundSettingsBtn?.classList.remove('hidden'); elements.soundSettingsBtn?.classList.add('show');
    elements.generalSettingsBtn?.classList.remove('hidden'); elements.generalSettingsBtn?.classList.add('show');
  }
  clickShowTimeout = setTimeout(() => {
    const isNearby = isMouseNearSettingsButton(event.clientX, event.clientY);
    if (!isNearby) { hideSettingsButton(); }
    clickShowTimeout = null;
  }, 2000);
}
function setupMouseDetection() {
  showSettingsButtonInitially();
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseout', (event) => { if (!event.relatedTarget || event.relatedTarget.nodeName === 'HTML') { hideSettingsButton(); } });
  window.addEventListener('mouseleave', () => { if (mouseDetectionTimeout) { clearTimeout(mouseDetectionTimeout); mouseDetectionTimeout = null; } hideSettingsButton(); });
  elements.settingsBtn?.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); elements.settings?.classList.toggle('hidden'); });
  elements.soundSettingsBtn?.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); const panel = document.getElementById('soundSettings'); panel?.classList.toggle('hidden'); });
  elements.generalSettingsBtn?.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); elements.generalSettings?.classList.toggle('hidden'); });
  window.addEventListener('click', (event) => { showSettingsButtonOnClick(event); });
}

let demoMessageCount = 0;
function startDemoMode() { if (demoModeInterval) return; showToast('Demo mode started'); demoMessageCount = 0; addDemoMessage(); scheduleNextDemoMessage(); }
function scheduleNextDemoMessage() { let delay; if (demoMessageCount === 1) { delay = 2000; } else if (demoMessageCount === 2) { delay = 3000; } else { delay = Math.random() * 3000 + 3000; } demoModeInterval = setTimeout(() => { addDemoMessage(); scheduleNextDemoMessage(); }, delay); }
function stopDemoMode() { if (demoModeInterval) { clearTimeout(demoModeInterval); demoModeInterval = null; demoMessageCount = 0; showToast('Demo mode stopped'); } }
function addDemoMessage() { const message = DEMO_MESSAGES[demoMessageIndex]; demoMessageIndex = (demoMessageIndex + 1) % DEMO_MESSAGES.length; demoMessageCount++; const demoEvent = { id: `demo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, author: message.author, text: message.text, kind: message.kind, ts: Date.now() }; const item = extEventToItem(demoEvent); const messageNode = renderMessage(item); if (messageNode) { pushMessageElement(messageNode, item.snippet.publishedAt); const shouldPlay = shouldPlaySound(item.snippet.publishedAt); if (shouldPlay) { if (item.snippet.type === 'newSponsorEvent' || item.snippet.type === 'memberMilestoneChatEvent') { if ((state.sounds.member.volume || 0) > 0) playSound(audio.member, state.sounds.member.volume); } else if (item.snippet.type === 'superChatEvent') { if ((state.sounds.donation.volume || 0) > 0) playSound(audio.donation, state.sounds.donation.volume); } else { if ((state.sounds.message.volume || 0) > 0) playSound(audio.message, state.sounds.message.volume); } } } }
function removeMessageById(messageId) { if (!messageId) return; const messageElement = document.querySelector(`.message[data-id="${messageId}"]`); if (messageElement) { messageElement.classList.add('deleting'); setTimeout(() => { if (messageElement.parentElement) { messageElement.parentElement.removeChild(messageElement); } }, 300); } state.seenIds.delete(messageId); state.byId.delete(messageId); }
function updateMessageById(updateEvent) { if (!updateEvent.id) return; const messageElement = document.querySelector(`.message[data-id="${updateEvent.id}"]`); if (!messageElement) return; const contentElement = messageElement.querySelector('.content'); if (!contentElement) return; contentElement.textContent = ''; const segments = updateEvent.segments; if (Array.isArray(segments) && segments.length) { for (const segment of segments) { if (!segment) continue; if (segment.t === 'text') { contentElement.append(segment.text || ''); } else if (segment.t === 'emote' && segment.url) { const img = document.createElement('img'); img.className = 'emoji-img'; img.src = segment.url; img.alt = segment.alt || ''; img.decoding = 'async'; img.loading = 'lazy'; contentElement.appendChild(img); } } } else { const text = updateEvent.text || ''; contentElement.append(text); } try { adjustMessageAlignment(messageElement); } catch {}
}
function clearAllMessages() { elements.messages.innerHTML = ''; state.seenIds.clear(); state.byId.clear(); showToast('All messages cleared'); }

const PRESETS = { Dark: { theme: { text: '#ffffff', textOpacity: 1, bubbleColor: '#ffffff', bgOpacity: 0.14 }, page: { color: '#000000', opacity: 1 }, showAvatars: true, showBadges: true, showBubbles: true, messageGapRem: 0.5, scale: 1.35 }, Light: { theme: { text: '#111111', textOpacity: 1, bubbleColor: '#000000', bgOpacity: 0.08 }, page: { color: '#ffffff', opacity: 1 }, showAvatars: true, showBadges: true, showBubbles: true, messageGapRem: 0.5, scale: 1.35 }, Transparent: { theme: { text: '#ffffff', textOpacity: 1, bubbleColor: '#ffffff', bgOpacity: 0.14 }, page: { color: '#000000', opacity: 0 }, showAvatars: true, showBadges: true, showBubbles: false, messageGapRem: 0.4, scale: 1.35 }, Custom: null };

const SETTINGS_TOGGLE_KEYS = ['Enter', ' ', 'Spacebar', 'Escape', 'Esc'];
const SOUND_FRESH_MS = 2000;
function isDemoSite() { return window.location.hostname.toLowerCase() === 'demo.challachat.com'; }

// ================================
// Color Helper Functions
// ================================

function isValidHexColor(hex) {
  if (!hex || typeof hex !== 'string') return false;
  // Remove # if present
  const cleanHex = hex.replace('#', '');
  // Check if it's 3 or 6 character hex
  return /^[0-9A-Fa-f]{3}$|^[0-9A-Fa-f]{6}$/.test(cleanHex);
}

function normalizeHexColor(hex) {
  if (!hex || typeof hex !== 'string') return '#000000';
  
  let cleanHex = hex.replace('#', '');
  
  // Convert 3-char hex to 6-char
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map(c => c + c).join('');
  }
  
  // Pad to 6 characters if needed
  cleanHex = cleanHex.padEnd(6, '0');
  
  return '#' + cleanHex.toLowerCase();
}

function updateColorPreview(inputElement, previewElement) {
  if (!inputElement || !previewElement) return;
  
  const hex = inputElement.value;
  if (isValidHexColor(hex)) {
    const normalizedHex = normalizeHexColor(hex);
    previewElement.style.backgroundColor = normalizedHex;
    inputElement.style.borderColor = 'rgba(255,255,255,0.15)';
  } else {
    previewElement.style.backgroundColor = 'transparent';
    inputElement.style.borderColor = 'rgba(255,100,100,0.5)';
  }
}

function setupColorInput(inputElement, previewElement) {
  if (!inputElement || !previewElement) return;
  
  // Initialize preview
  updateColorPreview(inputElement, previewElement);
  
  // Update preview on input
  inputElement.addEventListener('input', () => {
    updateColorPreview(inputElement, previewElement);
  });
  
  // Normalize and validate on blur
  inputElement.addEventListener('blur', () => {
    const hex = inputElement.value;
    if (isValidHexColor(hex)) {
      inputElement.value = normalizeHexColor(hex);
      updateColorPreview(inputElement, previewElement);
    }
  });
}

let audio = { ctx: null, gain: null, message: null, member: null, donation: null };
let audioUnlockHandlersAttached = false;
function ensureAudioContext() { if (audio.ctx) return; try { const AudioContext = window.AudioContext || window.webkitAudioContext; const ctx = new AudioContext(); const gain = ctx.createGain(); gain.gain.value = 1; gain.connect(ctx.destination); audio.ctx = ctx; audio.gain = gain; } catch {} }
async function loadAudio(src) {
  // Prefer WebAudio so we can support volumes > 1.0 (amplification up to 2x)
  try {
    ensureAudioContext();
    const response = await fetch(src);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audio.ctx.decodeAudioData(arrayBuffer);
    return { type: 'webaudio', buffer: audioBuffer };
  } catch {}
  // Fallback to HTMLAudioElement (volume capped at 1.0 by the platform)
  try {
    const audioElement = new Audio(src);
    audioElement.preload = 'auto';
    const prevMuted = audioElement.muted;
    audioElement.muted = true;
    await audioElement.play().catch(() => {});
    audioElement.pause();
    audioElement.currentTime = 0;
    audioElement.muted = prevMuted;
    return { type: 'html', node: audioElement };
  } catch {}
  return null;
}
function playSound(handle, vol = 1) {
  try { if (audio.ctx && audio.ctx.state === 'suspended') { audio.ctx.resume().catch(() => {}); } } catch {}
  if (!handle) { return; }
  const volume = Math.max(0, Math.min(2, vol));
  if (handle.type === 'html') {
    // HTMLAudioElement volume is clamped to 0..1 by browsers; play at 1 if >1 requested
    try {
      const src = handle.node.currentSrc || handle.node.src;
      if (src) {
        const dup = new Audio(src);
        dup.volume = Math.min(1, volume);
        dup.play().catch(() => {});
      } else {
        handle.node.muted = false;
        handle.node.volume = Math.min(1, volume);
        handle.node.currentTime = 0;
        handle.node.play().catch(() => {});
      }
    } catch {}
    return;
  }
  if (handle.type === 'webaudio') {
    try {
      ensureAudioContext();
      const source = audio.ctx.createBufferSource();
      source.buffer = handle.buffer;
      const gainNode = audio.ctx.createGain();
      // Support up to 2x amplification
      gainNode.gain.value = volume;
      source.connect(gainNode).connect(audio.gain);
      source.start(0);
    } catch {}
  }
}
async function initializeAudio() { try { audio.message = await loadAudio('/sounds/message.mp3'); } catch {} try { audio.member = await loadAudio('/sounds/member.mp3'); } catch {} try { audio.donation = await loadAudio('/sounds/donation.mp3'); } catch {} }

// Ensure audio context can be resumed after user interaction on browsers that block autoplay.
function attachAudioUnlockHandlers() {
  if (audioUnlockHandlersAttached) return;
  const unlockAudio = async () => {
    try { if (audio.ctx && audio.ctx.state === 'suspended') { await audio.ctx.resume(); } } catch {}
    for (const handle of [audio.message, audio.member, audio.donation]) {
      if (handle && handle.type === 'html') {
        try {
          const prevMuted = handle.node.muted;
          handle.node.muted = true;
          await handle.node.play().catch(() => {});
          handle.node.pause();
          handle.node.currentTime = 0;
          handle.node.muted = prevMuted;
        } catch {}
      }
    }
  };
  audioUnlockHandlersAttached = true;
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);
}

function applyPreset(name) { if (!name || name === 'Custom' || !PRESETS[name]) return; const preset = PRESETS[name]; state.theme = { text: preset.theme.text, textOpacity: preset.theme.textOpacity, bubbleColor: preset.theme.bubbleColor, bgOpacity: preset.theme.bgOpacity }; state.pageBgColor = preset.page.color; state.pageBgOpacity = preset.page.opacity; state.showAvatars = !!preset.showAvatars; state.showBadges = !!preset.showBadges; state.showBubbles = !!preset.showBubbles; state.messageGapRem = preset.messageGapRem; state.scale = preset.scale; }
function showToast(message, duration = 1600) { if (!elements.toast) return; elements.toast.textContent = message; elements.toast.classList.add('show'); elements.toast.classList.remove('hidden'); setTimeout(() => { elements.toast.classList.remove('show'); }, duration); }
function recomputeAutoScale() { const rect = elements.overlay.getBoundingClientRect(); const baseWidth = 420; const baseHeight = 700; const scaleFactor = Math.max(0.6, Math.min(2.2, Math.min(rect.width / baseWidth || 1, rect.height / baseHeight || 1))); state.autoScale = scaleFactor; }
function applyTheme() { 
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
  document.body.style.background = `rgba(${br}, ${bg}, ${bb}, ${bgOpacity})`; 
  document.documentElement.classList.toggle('no-bubbles', !state.showBubbles); 
  document.documentElement.classList.toggle('no-badges', !state.showBadges); 
  document.documentElement.classList.toggle('no-avatars', !state.showAvatars); 
}

function extEventToItem(event) { const id = event.id || `ext_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; const nowIso = new Date(event.ts || Date.now()).toISOString(); const authorDetails = { displayName: event?.author?.name || 'User', profileImageUrl: event?.author?.avatar || '', isChatOwner: !!event?.author?.flags?.owner, isChatModerator: !!event?.author?.flags?.mod, isVerified: !!event?.author?.flags?.verified, isChatSponsor: !!event?.author?.flags?.member, badges: Array.isArray(event?.author?.badges) ? event.author.badges : undefined }; let type = 'textMessageEvent'; const kind = event.kind || 'text'; if (kind === 'sub' || kind === 'member' || kind === 'member-renewal' || kind === 'member-gift') { type = 'newSponsorEvent'; } else if (kind === 'member-milestone') { type = 'memberMilestoneChatEvent'; } else if (kind === 'cheer' || kind === 'donation' || kind === 'tip') { type = 'superChatEvent'; } const snippet = { type, publishedAt: nowIso, displayMessage: event.text || '', textMessageDetails: { messageText: event.text || '' } }; const segments = Array.isArray(event.segments) ? event.segments : undefined; const extras = {}; if (kind === 'donation' && typeof event.amountDisplay === 'string') { extras.amountDisplay = event.amountDisplay; extras.color = event.color || ''; } return { id, snippet, authorDetails, segments, ...extras }; }

function renderMessage(item) {
  const { id, snippet, authorDetails } = item;
  if (state.seenIds.has(id)) return null;
  state.seenIds.add(id);

  const isSuper = (snippet?.type === 'superChatEvent' || snippet?.type === 'superStickerEvent' || snippet?.type === 'newSponsorEvent' || snippet?.type === 'memberMilestoneChatEvent');
  const container = document.createElement('div');
  container.className = `message${isSuper ? ' super' : ''}`;
  container.dataset.id = id;

  const isOwner = !!authorDetails?.isChatOwner;
  const isMod = !!authorDetails?.isChatModerator;
  const isMember = !!authorDetails?.isChatSponsor || snippet?.type === 'newSponsorEvent' || snippet?.type === 'memberMilestoneChatEvent';
  const isVerified = !!authorDetails?.isVerified;
  if (isOwner) { container.classList.add('ring-owner'); }
  else if (isMod) { container.classList.add('ring-mod'); }
  else if (isMember) { container.classList.add('ring-member'); }
  else if (isVerified) { container.classList.add('ring-verified'); }

  const avatarUrl = authorDetails?.profileImageUrl || authorDetails?.avatar || '';
  if (state.showAvatars && avatarUrl) {
    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.innerHTML = `<img alt="avatar" src="${avatarUrl}" />`;
    container.appendChild(avatar);
  }

  const body = document.createElement('div');
  body.className = 'body';
  const nameElement = document.createElement('span');
  nameElement.className = 'name';
  const baseName = (authorDetails?.displayName || authorDetails?.name || 'Unknown');
  // We'll append badges and colon separately to control exact order: <name><badges><colon>
  nameElement.textContent = baseName;
  const contentElement = document.createElement('span');
  contentElement.className = 'content';
  // If a donation amount is displayed, prepend a single space to the message content
  // so it doesn't stick to the donor's name/amount in the header.
  const hasAmount = (snippet?.type === 'superChatEvent' && typeof item.amountDisplay === 'string' && item.amountDisplay) || (typeof item.amountDisplay === 'string' && item.amountDisplay);
  if (hasAmount) {
    contentElement.append(' ');
  }

  const segments = item?.segments;
  if (Array.isArray(segments) && segments.length) {
    for (const segment of segments) {
      if (!segment) continue;
      if (segment.t === 'text') {
        contentElement.append(segment.text || '');
      } else if (segment.t === 'emote' && segment.url) {
        const img = document.createElement('img');
        img.className = 'emoji-img';
        img.src = segment.url;
        img.alt = segment.alt || '';
        img.decoding = 'async';
        img.loading = 'lazy';
        contentElement.appendChild(img);
      }
    }
  } else {
    const text = snippet?.displayMessage || snippet?.textMessageDetails?.messageText || '';
    contentElement.textContent = '';
    contentElement.append(text);
  }

  // Render header with optional badges; add a class when there are no visible badges
  const header = document.createElement('span');
  header.className = 'header';
  header.appendChild(nameElement);

  const badges = Array.isArray(item?.authorDetails?.badges) ? item.authorDetails.badges : [];
  if (state.showBadges && badges.length) {
    const badgesWrap = document.createElement('span');
    badgesWrap.className = 'badges badges-inline';
    // Match the name's font-size and line-height so badges scale like emotes
    try {
      const cs = getComputedStyle(nameElement);
      const fs = cs.fontSize;
      const lh = cs.lineHeight;
      if (fs) badgesWrap.style.fontSize = fs;
      if (lh && lh !== 'normal') badgesWrap.style.lineHeight = lh;
    } catch {}
    for (const b of badges) {
      if (b?.url) {
        const img = document.createElement('img');
        // Use the same styling as emotes to ensure identical scaling/alignment
        img.className = 'emoji-img badge-img';
        img.src = b.url;
        // Prevent visible text fallback if image fails; show tooltip instead
        img.alt = '';
        if (b.alt || b.type) img.title = b.alt || b.type;
        img.decoding = 'async';
        img.loading = 'lazy';
        badgesWrap.appendChild(img);
      } else if (b?.emoji && state.showEmojiBadges) {
        // Emoji fallback for built-in SVG-only badges (verified/mod/owner)
        const span = document.createElement('span');
        span.className = 'badge-emoji';
        span.textContent = b.emoji;
        span.title = b.alt || b.type || '';
        badgesWrap.appendChild(span);
      }
    }
    if (badgesWrap.childElementCount > 0) {
      header.appendChild(badgesWrap);
    } else {
      header.classList.add('no-inline-badges');
    }
  } else {
    header.classList.add('no-inline-badges');
  }

  // If super chat, show amount next to name (after badges)
  if (snippet?.type === 'superChatEvent' && typeof item.amountDisplay === 'string' && item.amountDisplay) {
    const amountEl = document.createElement('span');
    amountEl.className = 'primary';
    amountEl.textContent = ` ${item.amountDisplay}`;
    header.appendChild(amountEl);
  }
  // No colon
  body.appendChild(header);
  body.appendChild(contentElement);
  container.appendChild(body);
  return container;
}
function pushMessageElement(node, timestamp) { node.dataset.ts = String(timestamp || Date.now()); elements.messages.appendChild(node); try { adjustMessageAlignment(node); } catch {} }
function adjustMessageAlignment(node) { const body = node.querySelector('.body'); const content = node.querySelector('.content'); if (!body || !content) return; const computedStyle = getComputedStyle(content); let lineHeight = parseFloat(computedStyle.lineHeight); if (isNaN(lineHeight) || computedStyle.lineHeight === 'normal') { const fontSize = parseFloat(computedStyle.fontSize) || 14; lineHeight = fontSize * 1.35; } const bodyHeight = body.getBoundingClientRect().height; const isSingleLine = bodyHeight <= (lineHeight * 1.5); node.classList.toggle('single-line', isSingleLine); }

function shouldPlaySound(publishedAt) { const timestamp = new Date(publishedAt).getTime(); if (!Number.isFinite(timestamp)) return true; const startTimestamp = state.startedAt || 0; return timestamp >= (startTimestamp - SOUND_FRESH_MS); }
function startSSE() { if (isDemoSite()) { return; } showToast('Connecting…'); const eventSource = new EventSource('/api/stream'); eventSource.addEventListener('open', () => { try { if (audio.ctx && audio.ctx.state === 'suspended') { audio.ctx.resume().catch(() => {}); } } catch {} }); eventSource.addEventListener('chat', (event) => { try { const data = JSON.parse(event.data); const events = data.events || []; events.forEach((chatEvent) => { if (chatEvent.type === 'delete' && chatEvent.id) { removeMessageById(chatEvent.id); return; } if (chatEvent.type === 'update' && chatEvent.id) { updateMessageById(chatEvent); return; } const item = extEventToItem(chatEvent); const messageNode = renderMessage(item); if (messageNode) { pushMessageElement(messageNode, item.snippet.publishedAt); const shouldPlay = shouldPlaySound(item.snippet.publishedAt); if (shouldPlay) { if (item.snippet.type === 'newSponsorEvent' || item.snippet.type === 'memberMilestoneChatEvent') { if ((state.sounds.member.volume || 0) > 0) playSound(audio.member, state.sounds.member.volume); } else if (item.snippet.type === 'superChatEvent') { if ((state.sounds.donation.volume || 0) > 0) playSound(audio.donation, state.sounds.donation.volume); } else { if ((state.sounds.message.volume || 0) > 0) playSound(audio.message, state.sounds.message.volume); } try { if (audio.ctx && audio.ctx.state === 'suspended') { showToast('Click overlay to enable sound'); } } catch {} } } }); } catch {} }); eventSource.addEventListener('end', () => { showToast('Session ended'); }); eventSource.addEventListener('error', () => { showToast('Connection error'); }); }

function saveToLocal() { const settingsToSave = { scale: state.scale, showAvatars: state.showAvatars, showBadges: state.showBadges, showEmojiBadges: state.showEmojiBadges, theme: state.theme, showBubbles: state.showBubbles, messageGapRem: state.messageGapRem, pageBgColor: state.pageBgColor, pageBgOpacity: state.pageBgOpacity, preset: state.preset || 'Custom', demoMode: state.demoMode, sounds: state.sounds }; try { localStorage.setItem('challachat.settings', JSON.stringify(settingsToSave)); } catch {} }
function loadFromLocal() { let settingsString = null; try { settingsString = localStorage.getItem('challachat.settings'); } catch {} if (!settingsString) return; try { const data = JSON.parse(settingsString); if (typeof data.scale === 'number') state.scale = data.scale; if (typeof data.showAvatars === 'boolean') state.showAvatars = data.showAvatars; if (typeof data.showBadges === 'boolean') state.showBadges = data.showBadges; if (typeof data.showEmojiBadges === 'boolean') state.showEmojiBadges = data.showEmojiBadges; if (data.theme) { state.theme = { ...state.theme, ...data.theme }; if (typeof state.theme.textOpacity !== 'number') state.theme.textOpacity = 1; } if (typeof data.pageBgColor === 'string') state.pageBgColor = data.pageBgColor; if (typeof data.pageBgOpacity === 'number') state.pageBgOpacity = data.pageBgOpacity; if (typeof data.showBubbles === 'boolean') state.showBubbles = data.showBubbles; if (typeof data.messageGapRem === 'number') state.messageGapRem = data.messageGapRem; if (typeof data.preset === 'string') state.preset = data.preset; if (data.sounds && typeof data.sounds === 'object') { state.sounds = { ...state.sounds, ...data.sounds }; } if (typeof data.demoMode === 'boolean') state.demoMode = data.demoMode; } catch {}
}
function loadFromUrl() { const url = new URL(location.href); if (url.searchParams.has('scale')) { state.scale = Math.max(0.5, Math.min(3, Number(url.searchParams.get('scale')) || state.scale)); } if (url.searchParams.has('preset')) { state.preset = url.searchParams.get('preset') || state.preset; } if (url.searchParams.get('noavatars') === '1') state.showAvatars = false; if (url.searchParams.get('nobadges') === '1') state.showBadges = false; if (url.searchParams.get('showEmojiBadges') === '1') state.showEmojiBadges = true; if (url.searchParams.get('nobubbles') === '1') state.showBubbles = false; if (url.searchParams.has('gap')) { state.messageGapRem = Math.max(0, Math.min(1.5, Number(url.searchParams.get('gap')))); } if (url.searchParams.has('text')) { state.theme.text = `#${url.searchParams.get('text')}`.replace('##', '#'); } if (url.searchParams.has('bubble')) { state.theme.bubbleColor = `#${url.searchParams.get('bubble')}`.replace('##', '#'); } if (url.searchParams.has('bg')) { state.theme.bgOpacity = Math.max(0, Math.min(1, Number(url.searchParams.get('bg')))); } if (url.searchParams.has('pagebgcol')) { state.pageBgColor = `#${url.searchParams.get('pagebgcol')}`.replace('##', '#'); } if (url.searchParams.has('pagebgop')) { state.pageBgOpacity = Math.max(0, Math.min(1, Number(url.searchParams.get('pagebgop')))); } }
function syncUi() { 
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
  applyTheme();
  // Keep custom dropdown label/selection in sync
  try { syncCustomPresetDropdown(); } catch {}
}
function updateFromUi() { 
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
  if (elements.demoMode) { const newDemoMode = elements.demoMode.checked; if (newDemoMode !== state.demoMode) { state.demoMode = newDemoMode; if (state.demoMode) { startDemoMode(); } else { stopDemoMode(); } } } 
  if (elements.messageGap) { state.messageGapRem = Math.max(0, Math.min(1.5, Number(elements.messageGap.value))); } 
  if (elements.pageBgOpacity) { state.pageBgOpacity = Math.max(0, Math.min(1, Number(elements.pageBgOpacity.value))); }
  // Per-sound volumes only (set to 0 to disable)
  if (elements.msgVolume) state.sounds.message.volume = Math.max(0, Math.min(2, Number(elements.msgVolume.value)));
  if (elements.donationVolume) state.sounds.donation.volume = Math.max(0, Math.min(2, Number(elements.donationVolume.value)));
  if (elements.memberVolume) state.sounds.member.volume = Math.max(0, Math.min(2, Number(elements.memberVolume.value)));
  applyTheme(); saveToLocal(); 
}
function copyUrlWithSettings() { const baseUrl = new URL('/', location.origin); const params = baseUrl.searchParams; params.set('scale', String(state.scale)); if (state.preset && state.preset !== 'Custom') { params.set('preset', state.preset); } if (!state.showAvatars) params.set('noavatars', '1'); if (!state.showBadges) params.set('nobadges', '1'); if (!state.showBubbles) params.set('nobubbles', '1'); if (state.messageGapRem !== 0.4) { params.set('gap', String(state.messageGapRem)); } if (state.pageBgColor) { params.set('pagebgcol', state.pageBgColor.replace('#', '')); } if (typeof state.pageBgOpacity === 'number') { params.set('pagebgop', String(state.pageBgOpacity)); } params.set('text', state.theme.text.replace('#', '')); params.set('bubble', state.theme.bubbleColor.replace('#', '')); params.set('bg', String(state.theme.bgOpacity)); try { navigator.clipboard.writeText(baseUrl.toString()).then(() => showToast('URL copied')).catch(() => showToast('Copy failed')); } catch { showToast('Copy failed'); } }

// ================================
// Poll Interval Client <-> Server Wiring
// ================================
let lastCommittedPollInterval = null;
function setPollIntervalInputDisabled(disabled) {
  const input = elements.pollIntervalMs;
  if (!input) return;
  input.disabled = !!disabled;
}
async function fetchPollIntervalFromServer() {
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

// Removed global Test Sounds wiring; per-sound test buttons are bound in bindUi()
  function shouldIgnoreKeyEvent(event) { const target = event.target; if (!target) return false; const tag = (target.tagName || '').toUpperCase(); if (target.isContentEditable) return true; return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON'; }
  function bindUi() {
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
          if (mouseDetectionTimeout) { clearTimeout(mouseDetectionTimeout); }
          mouseDetectionTimeout = setTimeout(() => {
            if (elements.settings.classList.contains('hidden')) { hideSettingsButton(); }
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
      // General
      const generalPanel = elements.generalSettings;
      if (generalPanel && !generalPanel.classList.contains('hidden')) {
        if (!generalPanel.contains(target) && target !== elements.generalSettingsBtn) {
          generalPanel.classList.add('hidden');
        }
      }
    });
    // Basic controls
    // Setup color inputs with previews
    setupColorInput(elements.textColor, elements.textColorPreview);
    setupColorInput(elements.bubbleColor, elements.bubbleColorPreview);
    setupColorInput(elements.pageBgColor, elements.pageBgColorPreview);
    
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
    // Poll interval controls
    setupPollIntervalControls();
    // Per-sound Test buttons
    elements.testMessageBtn?.addEventListener('click', async (e) => { e.preventDefault(); e.stopPropagation(); ensureAudioContext(); if (!audio.message) { await initializeAudio(); } playSound(audio.message, state.sounds.message.volume); showToast('Test: message'); });
    elements.testDonationBtn?.addEventListener('click', async (e) => { e.preventDefault(); e.stopPropagation(); ensureAudioContext(); if (!audio.donation) { await initializeAudio(); } playSound(audio.donation, state.sounds.donation.volume); showToast('Test: donation'); });
    elements.testMemberBtn?.addEventListener('click', async (e) => { e.preventDefault(); e.stopPropagation(); ensureAudioContext(); if (!audio.member) { await initializeAudio(); } playSound(audio.member, state.sounds.member.volume); showToast('Test: membership'); });
  }
// ================================
// Custom Dropdown for Preset (avoid native popup in CEF/OBS)
// ================================
function buildCustomPresetDropdown() {
  const select = document.getElementById('preset');
  const mount = document.getElementById('presetSelect');
  if (!select || !mount) return;

  // Clear any prior content (idempotent)
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
      // Return focus to button
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
    // Focus selected or first option
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
    if (e.key === 'Escape' || e.key === 'Esc') { e.preventDefault(); closeMenu(); button.focus(); return; }
    const max = options.length - 1;
    if (e.key === 'ArrowDown') { e.preventDefault(); activeIndex = Math.min(max, activeIndex + 1); options[activeIndex]?.focus(); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); activeIndex = Math.max(0, activeIndex - 1); options[activeIndex]?.focus(); return; }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const el = options[activeIndex]; if (el) { const val = el.dataset.value || ''; const text = el.textContent || val; commitSelection(val, text); } closeMenu(); button.focus(); return; }
  };
  const commitSelection = (value, text) => {
    // Update hidden select
    if (select.value !== value) {
      select.value = value;
      select.dispatchEvent(new Event('change'));
    }
    // Update label
    labelSpan.textContent = text || value;
    // Update aria-selected markers
    options.forEach((el, i) => {
      if (el.dataset.value === value) { el.setAttribute('aria-selected', 'true'); activeIndex = i; }
      else { el.removeAttribute('aria-selected'); }
    });
  };

  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    open ? closeMenu() : openMenu();
  });
  button.addEventListener('keydown', (e) => {
    // Open with keyboard
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      openMenu();
    }
  });

  mount.appendChild(button);
  mount.appendChild(menu);
}

// Ensure the custom dropdown stays in sync if state changes programmatically
function syncCustomPresetDropdown() {
  try {
    const select = document.getElementById('preset');
    const label = document.querySelector('#presetSelect .select-custom__label');
    const options = document.querySelectorAll('#presetSelect .select-custom__option');
    if (!select || !label || !options.length) return;
    const currentText = select.options[select.selectedIndex]?.text || select.value;
    label.textContent = currentText;
    options.forEach((el, i) => {
      if (el.dataset.value === select.value) el.setAttribute('aria-selected', 'true');
      else el.removeAttribute('aria-selected');
    });
  } catch {}
}
function start() { state.startedAt = Date.now(); attachAudioUnlockHandlers(); setupMouseDetection(); recomputeAutoScale(); window.addEventListener('resize', () => { recomputeAutoScale(); applyTheme(); elements.messages.querySelectorAll('.message').forEach(adjustMessageAlignment); }); loadFromLocal(); loadFromUrl(); const url = new URL(location.href); const hasPresetParam = url.searchParams.has('preset'); const hasStyleParams = ['scale', 'noavatars', 'nobadges', 'nobubbles', 'gap', 'text', 'bubble', 'bg', 'pagebgcol', 'pagebgop'].some(key => url.searchParams.has(key)); if (!localStorage.getItem('challachat.settings') && !hasPresetParam && !hasStyleParams) { state.preset = 'Dark'; } else if (!state.preset) { state.preset = 'Custom'; } if (isDemoSite()) { state.demoMode = true; } applyPreset(state.preset); applyTheme(); syncUi(); bindUi(); if (state.demoMode) { startDemoMode(); } initializeAudio();
  // Fetch current poll interval from server (non-blocking)
  try { fetchPollIntervalFromServer(); } catch {}
  // Build custom preset dropdown (avoids native popup invisibility in CEF/OBS)
  try { buildCustomPresetDropdown(); syncCustomPresetDropdown(); } catch {}
  startSSE(); }
start();
// END mirrored content
