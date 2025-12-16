/**
 * ChallaChat Overlay - Audio System
 * WebAudio/HTMLAudio loading, playback, and unlock handlers
 */

// ================================
// Audio State
// ================================

export const audio = {
  ctx: null,
  gain: null,
  message: null,
  member: null,
  donation: null
};

let audioUnlockHandlersAttached = false;

// ================================
// Audio Context Management
// ================================

export function ensureAudioContext() {
  if (audio.ctx) return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContext();
    const gain = ctx.createGain();
    gain.gain.value = 1;
    gain.connect(ctx.destination);
    audio.ctx = ctx;
    audio.gain = gain;
  } catch {}
}

// ================================
// Audio Loading
// ================================

export async function loadAudio(src) {
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

// ================================
// Sound Playback
// ================================

export function playSound(handle, vol = 1) {
  try {
    if (audio.ctx && audio.ctx.state === 'suspended') {
      audio.ctx.resume().catch(() => {});
    }
  } catch {}
  
  if (!handle) return;
  
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

// ================================
// Audio Initialization
// ================================

export async function initializeAudio() {
  try { audio.message = await loadAudio('/sounds/message.mp3'); } catch {}
  try { audio.member = await loadAudio('/sounds/member.mp3'); } catch {}
  try { audio.donation = await loadAudio('/sounds/donation.mp3'); } catch {}
}

// ================================
// Audio Unlock Handlers
// ================================

// Ensure audio context can be resumed after user interaction on browsers that block autoplay.
export function attachAudioUnlockHandlers() {
  if (audioUnlockHandlersAttached) return;
  
  const unlockAudio = async () => {
    try {
      if (audio.ctx && audio.ctx.state === 'suspended') {
        await audio.ctx.resume();
      }
    } catch {}
    
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
