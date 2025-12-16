/**
 * ChallaChat Overlay - Music Player
 * Playlist management, playback controls, shuffle, now-playing, and jam integration
 */

import { state, elements, isDemoSite, showToast, saveToLocal } from './state.js';
import { clamp01, postJson, shuffleInPlace } from './utils.js';

// ================================
// Music Player State
// ================================

export const musicPlayer = {
  playlist: [],
  meta: [],
  order: [],
  index: 0,
  audio: null,
  lastWrittenServerIndex: null,
  hasAutoShuffled: false,
  playlistLoop: true  // Default to true, updated from server settings
};

// ================================
// Utility Functions
// ================================

export function applyMusicVolume() {
  if (!musicPlayer.audio) return;
  musicPlayer.audio.volume = clamp01(state?.music?.volume ?? 1);
}

export function getServerIndexAtPos(pos) {
  const p = Number(pos) || 0;
  if (Array.isArray(musicPlayer.order) && musicPlayer.order.length) {
    const serverIndex = musicPlayer.order[p];
    if (Number.isFinite(serverIndex)) return serverIndex;
  }
  return p;
}

export function resetMusicOrderToDefault() {
  musicPlayer.order = Array.from({ length: musicPlayer.playlist.length }, (_, i) => i);
}

function getTrackTitle(trackPath) {
  if (!trackPath || typeof trackPath !== 'string') return '';
  const parts = trackPath.split(/[/\\]+/);
  const fileName = parts[parts.length - 1] || '';
  return fileName.replace(/\.[^.]+$/, '');
}

// ================================
// Track Metadata
// ================================

async function fetchTrackMeta(serverIndex) {
  if (isDemoSite()) return { title: null, artist: null };
  const resp = await fetch(`/api/music/track/${serverIndex}/meta`, { cache: 'no-store' });
  if (!resp.ok) throw new Error('HTTP error');
  return resp.json();
}

async function ensureTrackMetaLoaded(serverIndex) {
  if (!musicPlayer.playlist.length) return;
  if (!Array.isArray(musicPlayer.meta) || musicPlayer.meta.length !== musicPlayer.playlist.length) {
    musicPlayer.meta = Array.from({ length: musicPlayer.playlist.length });
  }

  // `undefined` = not fetched yet; `null` = fetched but missing/failed.
  if (musicPlayer.meta[serverIndex] !== undefined) return;
  musicPlayer.meta[serverIndex] = null;

  try {
    const data = await fetchTrackMeta(serverIndex);
    const title = typeof data?.title === 'string' ? data.title.trim() : '';
    const artist = typeof data?.artist === 'string' ? data.artist.trim() : '';
    const titleFinal = title || null;
    const artistFinal = artist || null;
    musicPlayer.meta[serverIndex] = { title: titleFinal, artist: artistFinal };
  } catch {
    musicPlayer.meta[serverIndex] = null;
  }
}

function formatTitleAndArtist(title, artist) {
  const t = typeof title === 'string' ? title.trim() : '';
  const a = typeof artist === 'string' ? artist.trim() : '';
  if (!t) return '';
  if (!a) return t;
  return `${t} - ${a}`;
}

export function getDisplayTitleAtPos(pos) {
  if (!musicPlayer.playlist.length) return '(no tracks)';
  const serverIndex = getServerIndexAtPos(pos);
  const cached = Array.isArray(musicPlayer.meta) ? musicPlayer.meta[serverIndex] : undefined;
  if (cached && typeof cached === 'object') {
    const combined = formatTitleAndArtist(cached.title, cached.artist);
    if (combined) return combined;
    if (typeof cached.title === 'string' && cached.title.trim()) return cached.title.trim();
  }

  const trackPath = musicPlayer.playlist[serverIndex];
  const fallback = getTrackTitle(trackPath);
  return fallback || '(unknown)';
}

// ================================
// Now Playing + Jam Integration
// ================================

export async function notifyNowPlaying(serverIndex, songId) {
  if (isDemoSite()) return;
  const idx = Number(serverIndex);
  if (!Number.isInteger(idx) || idx < 0) return;
  const sid = typeof songId === 'string' ? songId.trim() : '';
  try {
    await postJson('/api/music/nowplaying', { index: idx, songId: sid || undefined });
  } catch {
    // ignore
  }
}

export async function toggleJam(enabled) {
  if (isDemoSite()) return;
  try {
    await postJson('/api/jam/toggle', { enabled: !!enabled });
  } catch {
    // ignore
  }
}

// ================================
// UI Sync
// ================================

export function syncMusicUi() {
  // Current title
  const titleEl = elements.musicCurrentTitle;
  if (titleEl) {
    titleEl.textContent = getDisplayTitleAtPos(musicPlayer.index);

    // Attempt to replace filename fallback with ID3 title when available.
    if (musicPlayer.playlist.length) {
      const serverIndexSnapshot = getServerIndexAtPos(musicPlayer.index);
      void ensureTrackMetaLoaded(serverIndexSnapshot).then(() => {
        // Only update if user hasn't changed tracks since we started.
        if (getServerIndexAtPos(musicPlayer.index) !== serverIndexSnapshot) return;
        titleEl.textContent = getDisplayTitleAtPos(musicPlayer.index);
      });
    }
  }

  // Play button label (toggle)
  const playBtn = elements.musicPlayBtn;
  if (playBtn) {
    const isPlaying = !!(musicPlayer.audio && !musicPlayer.audio.paused);
    playBtn.textContent = isPlaying ? 'Pause' : 'Play';
  }

  requestSongFileWrite();
}

export function requestSongFileWrite({ force = false } = {}) {
  if (!state?.music?.writeSongFile) return;
  if (isDemoSite()) return;

  if (!musicPlayer.playlist.length) {
    void ensureMusicPlaylistLoaded().then(() => requestSongFileWrite({ force })).catch(() => {});
    return;
  }

  const serverIndex = getServerIndexAtPos(musicPlayer.index);
  if (!Number.isFinite(serverIndex)) return;

  if (!force && musicPlayer.lastWrittenServerIndex === serverIndex) return;
  musicPlayer.lastWrittenServerIndex = serverIndex;

  let songId = '';
  try { songId = getDisplayTitleAtPos(musicPlayer.index) || ''; } catch {}
  void postJson('/api/music/songfile', { index: serverIndex, songId: songId || undefined }).catch(() => {});
}

export function setMusicIndex(i, { save = true } = {}) {
  if (!musicPlayer.playlist.length) {
    musicPlayer.index = 0;
    state.music.index = 0;
    syncMusicUi();
    if (save) saveToLocal();
    return;
  }
  const nextIndex = Math.max(0, Math.min(musicPlayer.playlist.length - 1, Number(i) || 0));
  musicPlayer.index = nextIndex;
  state.music.index = nextIndex;
  syncMusicUi();
  if (save) saveToLocal();
}

// ================================
// Playlist Loading
// ================================

async function fetchMusicPlaylist() {
  if (isDemoSite()) return { playlist: [], count: 0, musicPath: null };
  const resp = await fetch('/api/music/playlist', { cache: 'no-store' });
  if (!resp.ok) throw new Error('HTTP error');
  return resp.json();
}

async function fetchMusicServerSettings() {
  if (isDemoSite()) return { autoShuffle: false, playlistLoop: true };
  try {
    const resp = await fetch('/api/music', { cache: 'no-store' });
    if (!resp.ok) return { autoShuffle: false, playlistLoop: true };
    const data = await resp.json();
    return {
      autoShuffle: data?.autoShuffle === true,
      playlistLoop: data?.playlistLoop !== false  // Default to true
    };
  } catch {
    return { autoShuffle: false, playlistLoop: true };
  }
}

export async function ensureMusicPlaylistLoaded() {
  if (musicPlayer.playlist.length) return;
  const data = await fetchMusicPlaylist();
  const list = Array.isArray(data?.playlist) ? data.playlist : [];
  musicPlayer.playlist = list;
  musicPlayer.meta = Array.from({ length: musicPlayer.playlist.length });
  if (!musicPlayer.order || musicPlayer.order.length !== musicPlayer.playlist.length) {
    resetMusicOrderToDefault();
  }

  // Fetch server settings and apply auto-shuffle + playlist loop
  if (!musicPlayer.hasAutoShuffled && musicPlayer.playlist.length > 0) {
    const serverSettings = await fetchMusicServerSettings();
    musicPlayer.playlistLoop = serverSettings.playlistLoop;
    if (serverSettings.autoShuffle && musicPlayer.playlist.length > 1) {
      shuffleInPlace(musicPlayer.order);
      musicPlayer.hasAutoShuffled = true;
    }
  }

  // Restore last-known index (clamped)
  const requestedIndex = Number(state?.music?.index) || 0;
  if (!musicPlayer.playlist.length) {
    musicPlayer.index = 0;
    state.music.index = 0;
  } else {
    musicPlayer.index = Math.max(0, Math.min(musicPlayer.playlist.length - 1, requestedIndex));
    state.music.index = musicPlayer.index;
  }
  syncMusicUi();
}

// ================================
// Playback
// ================================

export async function playMusicIndex(i) {
  const serverIndex = getServerIndexAtPos(i);
  const mappedPath = musicPlayer.playlist[serverIndex];
  if (!mappedPath) throw new Error('Missing track');

  setMusicIndex(i);

  if (!musicPlayer.audio) {
    musicPlayer.audio = new Audio();
    musicPlayer.audio.preload = 'auto';
    musicPlayer.audio.addEventListener('play', () => { syncMusicUi(); });
    musicPlayer.audio.addEventListener('pause', () => { syncMusicUi(); });
    musicPlayer.audio.addEventListener('ended', async () => {
      let nextPos = musicPlayer.index + 1;
      if (nextPos >= musicPlayer.playlist.length) {
        if (musicPlayer.playlistLoop && musicPlayer.playlist.length > 0) {
          // Loop back to the beginning
          nextPos = 0;
        } else {
          syncMusicUi();
          return;
        }
      }

      // Continue playback seamlessly by loading the next track.
      try {
        await playMusicIndex(nextPos);
      } catch {
        // If auto-advance fails (e.g., missing file), keep UI consistent.
        try { setMusicIndex(nextPos); } catch {}
        try { syncMusicUi(); } catch {}
      }
    });
  }

  // Fire-and-forget metadata load so the UI can show ID3 title quickly.
  void ensureTrackMetaLoaded(serverIndex).then(() => {
    try { syncMusicUi(); } catch {}
    try { void notifyNowPlaying(serverIndex, getDisplayTitleAtPos(i)); } catch {}
  });

  applyMusicVolume();

  // Let the server know which track is now playing (used for !jam tracking)
  // This may initially be filename-based; we update once meta loads.
  try { void notifyNowPlaying(serverIndex, getDisplayTitleAtPos(i)); } catch { void notifyNowPlaying(serverIndex); }

  musicPlayer.audio.src = `/api/music/track/${serverIndex}`;
  await musicPlayer.audio.play();
}

// ================================
// Music Controls (shared by UI + terminal hotkeys)
// ================================

export async function musicTogglePlayPause() {
  try {
    await ensureMusicPlaylistLoaded();
    if (!musicPlayer.playlist.length) {
      showToast('No music found');
      return;
    }

    // Toggle play/pause for the *current* tracked index.
    if (musicPlayer.audio && !musicPlayer.audio.paused) {
      musicPlayer.audio.pause();
      syncMusicUi();
      return;
    }

    if (musicPlayer.audio && musicPlayer.audio.paused) {
      const wants = `/api/music/track/${getServerIndexAtPos(musicPlayer.index)}`;
      const isSameTrack = typeof musicPlayer.audio.src === 'string' && musicPlayer.audio.src.includes(wants);
      applyMusicVolume();
      if (isSameTrack) {
        await musicPlayer.audio.play();
        return;
      }
    }

    await playMusicIndex(musicPlayer.index);
  } catch {
    showToast('Failed to play music');
  }
}

export async function musicPrev() {
  try {
    await ensureMusicPlaylistLoaded();
    if (!musicPlayer.playlist.length) {
      showToast('No music found');
      return;
    }
    const prev = musicPlayer.index - 1;
    if (prev < 0) return;

    const wasPlaying = !!(musicPlayer.audio && !musicPlayer.audio.paused);
    setMusicIndex(prev);
    if (wasPlaying) {
      await playMusicIndex(prev);
    }
  } catch {
    showToast('Failed to play previous');
  }
}

export async function musicNext() {
  try {
    await ensureMusicPlaylistLoaded();
    if (!musicPlayer.playlist.length) {
      showToast('No music found');
      return;
    }
    const next = musicPlayer.index + 1;
    if (next >= musicPlayer.playlist.length) return;

    const wasPlaying = !!(musicPlayer.audio && !musicPlayer.audio.paused);
    setMusicIndex(next);
    if (wasPlaying) {
      await playMusicIndex(next);
    }
  } catch {
    showToast('Failed to play next');
  }
}

export async function musicShuffle() {
  try {
    await ensureMusicPlaylistLoaded();
    if (!musicPlayer.playlist.length) {
      showToast('No music found');
      return;
    }

    const wasPlaying = !!(musicPlayer.audio && !musicPlayer.audio.paused);
    resetMusicOrderToDefault();
    shuffleInPlace(musicPlayer.order);
    setMusicIndex(0);

    if (wasPlaying) {
      await playMusicIndex(0);
    } else {
      syncMusicUi();
    }
  } catch {
    showToast('Failed to shuffle');
  }
}

// ================================
// Music Settings (read-only)
// ================================

export async function fetchMusicSettings() {
  const el = elements.musicPathDisplay;
  if (!el) return;

  if (isDemoSite()) {
    el.textContent = 'Not available on demo site';
    return;
  }

  try {
    const resp = await fetch('/api/music', { cache: 'no-store' });
    if (!resp.ok) throw new Error('HTTP error');
    const data = await resp.json();
    const pathValue = typeof data?.musicPath === 'string' ? data.musicPath : null;
    el.textContent = pathValue && pathValue.trim().length ? pathValue : '(not set)';
  } catch {
    el.textContent = '(unavailable)';
  }
}
