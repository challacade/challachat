/**
 * Admin panel audio system — Web Audio API with HTML Audio fallback.
 */
import { msgVolSlider, donVolSlider, memVolSlider } from './dom.js';

const adminAudio = { ctx: null, gain: null, message: null, donation: null, member: null };

function ensureAudioCtx() {
  if (adminAudio.ctx) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    const gain = ctx.createGain();
    gain.gain.value = 1;
    gain.connect(ctx.destination);
    adminAudio.ctx = ctx;
    adminAudio.gain = gain;
  } catch {}
}

async function loadAudioBuffer(src) {
  try {
    ensureAudioCtx();
    const resp = await fetch(src);
    const ab = await resp.arrayBuffer();
    const buf = await adminAudio.ctx.decodeAudioData(ab);
    return { type: 'webaudio', buffer: buf };
  } catch {}
  // Fallback to HTML Audio
  try {
    const el = new Audio(src);
    el.preload = 'auto';
    return { type: 'html', node: el };
  } catch {}
  return null;
}

export function playSoundAdmin(handle, vol = 1) {
  if (!handle) return;
  try { if (adminAudio.ctx?.state === 'suspended') adminAudio.ctx.resume().catch(() => {}); } catch {}
  const volume = Math.max(0, Math.min(2, vol));
  if (handle.type === 'webaudio') {
    try {
      ensureAudioCtx();
      const src = adminAudio.ctx.createBufferSource();
      src.buffer = handle.buffer;
      const g = adminAudio.ctx.createGain();
      g.gain.value = volume;
      src.connect(g).connect(adminAudio.gain);
      src.start(0);
    } catch {}
  } else if (handle.type === 'html') {
    try {
      const s = handle.node.currentSrc || handle.node.src;
      if (s) {
        const dup = new Audio(s);
        dup.volume = Math.min(1, volume);
        dup.play().catch(() => {});
      }
    } catch {}
  }
}

export async function initAdminAudio() {
  ensureAudioCtx();
  // For each type, try custom sound first, fall back to default
  for (const type of ['message', 'donation', 'member']) {
    const handle = await loadCustomOrDefault(type);
    adminAudio[type] = handle;
  }
}

async function loadCustomOrDefault(type) {
  // Try loading custom sound from server
  try {
    const resp = await fetch(`/api/sounds/file/${type}`);
    if (resp.ok) {
      const handle = await loadAudioBuffer(resp.url);
      if (handle) return handle;
    }
  } catch {}
  // Fall back to default
  return loadAudioBuffer(`/sounds/${type}.mp3`);
}

/** Reload a single sound type (after user picks a custom file). */
export async function reloadCustomSound(type) {
  ensureAudioCtx();
  const handle = await loadCustomOrDefault(type);
  adminAudio[type] = handle;
}

/** Start SSE listener for play-sound events from server. */
export function startAdminSSE() {
  const es = new EventSource('/api/stream');
  es.addEventListener('play-sound', (event) => {
    try {
      const data = JSON.parse(event.data);
      const type = data?.type; // 'message' | 'donation' | 'member'
      if (type === 'member' && adminAudio.member) {
        playSoundAdmin(adminAudio.member, Number(memVolSlider.value) || 0);
      } else if (type === 'donation' && adminAudio.donation) {
        playSoundAdmin(adminAudio.donation, Number(donVolSlider.value) || 0);
      } else if (type === 'message' && adminAudio.message) {
        playSoundAdmin(adminAudio.message, Number(msgVolSlider.value) || 0);
      }
    } catch {}
  });
  es.addEventListener('error', () => {
    // Auto-reconnect is built into EventSource
  });
}

// ─── Tracked test-sound playback ───────────────────────────

let activeTestSource = null;

export function stopTestSound() {
  if (!activeTestSource) return;
  try {
    if (activeTestSource.type === 'webaudio' && activeTestSource.src) {
      activeTestSource.src.stop();
    } else if (activeTestSource.type === 'html' && activeTestSource.node) {
      activeTestSource.node.pause();
      activeTestSource.node.currentTime = 0;
    }
  } catch {}
  activeTestSource = null;
}

export function updateTestSoundVolume(vol) {
  if (!activeTestSource) return;
  const volume = Math.max(0, Math.min(2, vol));
  try {
    if (activeTestSource.type === 'webaudio' && activeTestSource.gain) {
      activeTestSource.gain.gain.value = volume;
    } else if (activeTestSource.type === 'html' && activeTestSource.node) {
      activeTestSource.node.volume = Math.min(1, volume);
    }
  } catch {}
}

export function playTestSoundAdmin(handle, vol = 1) {
  stopTestSound();
  if (!handle) return;
  try { if (adminAudio.ctx?.state === 'suspended') adminAudio.ctx.resume().catch(() => {}); } catch {}
  const volume = Math.max(0, Math.min(2, vol));
  if (handle.type === 'webaudio') {
    try {
      ensureAudioCtx();
      const src = adminAudio.ctx.createBufferSource();
      src.buffer = handle.buffer;
      const g = adminAudio.ctx.createGain();
      g.gain.value = volume;
      src.connect(g).connect(adminAudio.gain);
      src.start(0);
      activeTestSource = { type: 'webaudio', src, gain: g };
      src.onended = () => { if (activeTestSource?.src === src) activeTestSource = null; };
    } catch {}
  } else if (handle.type === 'html') {
    try {
      const s = handle.node.currentSrc || handle.node.src;
      if (s) {
        const dup = new Audio(s);
        dup.volume = Math.min(1, volume);
        dup.play().catch(() => {});
        activeTestSource = { type: 'html', node: dup };
        dup.onended = () => { if (activeTestSource?.node === dup) activeTestSource = null; };
      }
    } catch {}
  }
}

export { adminAudio, ensureAudioCtx };
