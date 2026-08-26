/**
 * Music player - playlist management, playback, display settings.
 */
import {
  isElectron,
  musicNowPlaying,
  musicPrevBtn, musicPlayBtn, musicNextBtn, musicShuffleBtn,
  musicProgressBar, musicTimeCurrent, musicTimeTotal,
  musicVolSlider, musicVolLabel, musicVolIcon,
  musicPanSlider,
  musicPathInput, musicBrowseBtn,
  songDisplaySelect, scrollSpeedSlider, scrollSpeedLabel,
  songTextSizeSlider, songTextSizeLabel,
  writeSongFileToggle, songFilePathInput, songFileBrowseBtn, songFileClearBtn,
  autoShuffleToggle, playlistLoopToggle, externalMusicDataToggle,
} from './dom.js';
import { api, postJsonQuiet } from './api.js';
import { debounce } from '/shared/utils.js';

// ─── Music state ───────────────────────────────────────────────

const music = {
  playlist: [],    // array of file paths from server
  meta: [],        // array of { title, artist } per server index
  order: [],       // shuffle-aware index mapping
  index: 0,        // position in order[]
  audio: null,     // HTMLAudioElement
  gainNode: null,  // GainNode for volume amplification
  panNode: null,    // StereoPannerNode for L/R pan
  playlistLoop: true,
  autoShuffle: false,
  externalMusicData: false,
  isConfigured: false,
  songDisplay: 'none',
  writeSongFile: false,
  songFilePath: '',
  songScrollSpeed: 0,
  songTextSize: 1,
  volume: 1,
  pan: 0,
  seeking: false,
};

// ─── Helpers ───────────────────────────────────────────────────

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function serverIndexAtPos(pos) {
  const p = Number(pos) || 0;
  if (Array.isArray(music.order) && music.order.length) {
    const si = music.order[p];
    if (Number.isFinite(si)) return si;
  }
  return p;
}

function resetMusicOrder() {
  music.order = Array.from({ length: music.playlist.length }, (_, i) => i);
}

function trackTitleFromPath(filePath) {
  if (!filePath || typeof filePath !== 'string') return '';
  const parts = filePath.split(/[/\\]+/);
  const fn = parts[parts.length - 1] || '';
  return fn.replace(/\.[^.]+$/, '');
}

async function fetchTrackMeta(serverIndex) {
  return api('GET', `/api/music/track/${serverIndex}/meta`);
}

async function ensureMetaLoaded(serverIndex) {
  if (!music.playlist.length) return;
  if (!Array.isArray(music.meta) || music.meta.length !== music.playlist.length) {
    music.meta = Array.from({ length: music.playlist.length });
  }
  if (music.meta[serverIndex] !== undefined) return;
  music.meta[serverIndex] = null;
  try {
    const data = await fetchTrackMeta(serverIndex);
    const title = typeof data?.title === 'string' ? data.title.trim() : '';
    const artist = typeof data?.artist === 'string' ? data.artist.trim() : '';
    music.meta[serverIndex] = { title: title || null, artist: artist || null };
  } catch {
    music.meta[serverIndex] = null;
  }
}

function displayTitle(pos) {
  if (!music.playlist.length) return '(no tracks)';
  const si = serverIndexAtPos(pos);
  const cached = Array.isArray(music.meta) ? music.meta[si] : undefined;
  if (cached && typeof cached === 'object') {
    const t = (cached.title || '').trim();
    const a = (cached.artist || '').trim();
    if (t && a) return `${t} - ${a}`;
    if (t) return t;
  }
  return trackTitleFromPath(music.playlist[si]) || '(unknown)';
}

// ─── UI sync ───────────────────────────────────────────────────

function triggerSongFileWrite() {
  if (music.writeSongFile && music.playlist.length) {
    const si = serverIndexAtPos(music.index);
    void postJsonQuiet('/api/music/songfile', { index: si, songId: displayTitle(music.index) });
  }
}

function setSongIdText(text) {
  if (musicNowPlaying) musicNowPlaying.textContent = text;
}

function syncMusicUI() {
  // Title
  setSongIdText(displayTitle(music.index));
  // Lazy-load ID3 meta then update
  if (music.playlist.length) {
    const snap = serverIndexAtPos(music.index);
    void ensureMetaLoaded(snap).then(() => {
      if (serverIndexAtPos(music.index) === snap) {
        setSongIdText(displayTitle(music.index));
        // Re-notify server with metadata title (initial post may have used filename fallback)
        void postJsonQuiet('/api/music/nowplaying', { index: snap, songId: displayTitle(music.index), playing: isMusicPlaying() });
        if (music.writeSongFile) {
          void postJsonQuiet('/api/music/songfile', { index: snap, songId: displayTitle(music.index) });
        }
      }
    });
  }
  // Play/Pause button
  if (musicPlayBtn) {
    const playing = !!(music.audio && !music.audio.paused);
    musicPlayBtn.textContent = playing ? '⏸' : '▶';
  }
  // Notify server of now-playing
  const si = serverIndexAtPos(music.index);
  if (music.playlist.length) {
    void postJsonQuiet('/api/music/nowplaying', { index: si, songId: displayTitle(music.index), playing: isMusicPlaying() });
  }
  // Write song file if enabled
  if (music.writeSongFile && music.playlist.length) {
    void postJsonQuiet('/api/music/songfile', { index: si, songId: displayTitle(music.index) });
  }
}

function setMusicIndex(i) {
  if (!music.playlist.length) { music.index = 0; syncMusicUI(); return; }
  music.index = Math.max(0, Math.min(music.playlist.length - 1, Number(i) || 0));
  syncMusicUI();
}

function syncMusicVolUI() {
  const v = music.volume;
  if (musicVolLabel) musicVolLabel.textContent = `${Math.round(v * 100)}%`;
  if (musicVolIcon) {
    musicVolIcon.textContent = v === 0 ? '\uD83D\uDD07' : v < 0.5 ? '\uD83D\uDD09' : '\uD83D\uDD0A';
  }
}

function applyMusicVolume() {
  if (music.gainNode) {
    music.gainNode.gain.value = music.volume;
  }
}

function applyMusicPan() {
  if (music.panNode) {
    music.panNode.pan.value = music.pan;
  }
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function syncProgressUI() {
  if (!music.audio || music.seeking) return;
  const cur = music.audio.currentTime || 0;
  const dur = music.audio.duration || 0;
  if (musicTimeCurrent) musicTimeCurrent.textContent = formatTime(cur);
  if (musicTimeTotal) musicTimeTotal.textContent = formatTime(dur);
  if (musicProgressBar && dur > 0) {
    musicProgressBar.value = cur / dur;
  } else if (musicProgressBar) {
    musicProgressBar.value = 0;
  }
}

function resetProgressUI() {
  if (musicTimeCurrent) musicTimeCurrent.textContent = '0:00';
  if (musicTimeTotal) musicTimeTotal.textContent = '0:00';
  if (musicProgressBar) musicProgressBar.value = 0;
}

function syncMusicDisplayUI() {
  if (songDisplaySelect) songDisplaySelect.value = music.songDisplay || 'none';
  if (scrollSpeedSlider) scrollSpeedSlider.value = String(music.songScrollSpeed || 0);
  if (scrollSpeedLabel) scrollSpeedLabel.textContent = `Scroll speed: ${Math.round((music.songScrollSpeed || 0) * 100)}%`;
  if (songTextSizeSlider) songTextSizeSlider.value = String(music.songTextSize ?? 1);
  if (songTextSizeLabel) songTextSizeLabel.textContent = `Text size: ${Math.round((music.songTextSize ?? 1) * 100)}%`;
  if (writeSongFileToggle) writeSongFileToggle.checked = !!music.writeSongFile;
  if (songFilePathInput) songFilePathInput.value = music.songFilePath || '';
  if (songFileClearBtn) songFileClearBtn.style.display = music.songFilePath ? '' : 'none';
  if (autoShuffleToggle) autoShuffleToggle.checked = !!music.autoShuffle;
  if (playlistLoopToggle) playlistLoopToggle.checked = music.playlistLoop !== false;
  if (externalMusicDataToggle) externalMusicDataToggle.checked = !!music.externalMusicData;
}

// ─── Playlist / config ─────────────────────────────────────────

async function loadMusicPlaylist() {
  try {
    const data = await api('GET', '/api/music/playlist');
    const list = Array.isArray(data?.playlist) ? data.playlist : [];
    music.playlist = list;
    music.meta = Array.from({ length: list.length });
    resetMusicOrder();
  } catch {}
}

async function fetchMusicConfig() {
  try {
    const data = await api('GET', '/api/music');
    const mPath = typeof data?.musicPath === 'string' ? data.musicPath.trim() : '';
    music.isConfigured = !!mPath;
    music.playlistLoop = data?.playlistLoop !== false;
    music.autoShuffle = data?.autoShuffle === true;
    music.externalMusicData = data?.externalMusicData === true;
    if (musicPathInput) musicPathInput.value = mPath || '';
    // Display settings are included in the main music config response
    if (typeof data?.songDisplay === 'string') music.songDisplay = data.songDisplay;
    if (typeof data?.writeSongFile === 'boolean') music.writeSongFile = data.writeSongFile;
    if (typeof data?.songFilePath === 'string') music.songFilePath = data.songFilePath;
    if (typeof data?.songScrollSpeed === 'number') music.songScrollSpeed = data.songScrollSpeed;
    if (typeof data?.songTextSize === 'number') music.songTextSize = data.songTextSize;
    // Music playback settings
    if (typeof data?.musicVolume === 'number') {
      music.volume = data.musicVolume;
      if (musicVolSlider) musicVolSlider.value = music.volume;
      syncMusicVolUI();
    }
    if (typeof data?.musicPan === 'number') {
      music.pan = data.musicPan;
      if (musicPanSlider) musicPanSlider.value = music.pan;
    }
    syncMusicDisplayUI();
  } catch {}
}

// ─── Playback ──────────────────────────────────────────────────

function isMusicPlaying() {
  return !!(music.audio && !music.audio.paused && !music.audio.ended);
}

async function playMusicAt(pos) {
  const si = serverIndexAtPos(pos);
  const trackPath = music.playlist[si];
  if (!trackPath) return;

  setMusicIndex(pos);

  if (!music.audio) {
    music.audio = new Audio();
    music.audio.preload = 'auto';
    // Set up Web Audio gain node for volume amplification (>100%)
    const actx = new (window.AudioContext || window.webkitAudioContext)();
    const source = actx.createMediaElementSource(music.audio);
    music.gainNode = actx.createGain();
    music.panNode = actx.createStereoPanner();
    source.connect(music.gainNode);
    music.gainNode.connect(music.panNode);
    music.panNode.connect(actx.destination);
    music.audio.addEventListener('play', () => syncMusicUI());
    music.audio.addEventListener('pause', () => syncMusicUI());
    music.audio.addEventListener('timeupdate', () => syncProgressUI());
    music.audio.addEventListener('loadedmetadata', () => syncProgressUI());
    music.audio.addEventListener('ended', async () => {
      let next = music.index + 1;
      if (next >= music.playlist.length) {
        if (music.playlistLoop && music.playlist.length > 0) {
          next = 0;
        } else {
          syncMusicUI();
          return;
        }
      }
      try { await playMusicAt(next); } catch { setMusicIndex(next); }
    });
  }

  // Lazy-load meta then re-sync
  void ensureMetaLoaded(si).then(() => syncMusicUI());

  music.audio.src = `/api/music/track/${si}`;
  resetProgressUI();
  applyMusicVolume();
  applyMusicPan();
  await music.audio.play();
}

async function musicTogglePlayPause() {
  if (!music.playlist.length) {
    await loadMusicPlaylist();
    if (!music.playlist.length) return;
  }
  if (music.audio && !music.audio.paused) {
    music.audio.pause();
    return;
  }
  if (music.audio && music.audio.paused && music.audio.src) {
    const wants = `/api/music/track/${serverIndexAtPos(music.index)}`;
    if (music.audio.src.includes(wants)) {
      await music.audio.play();
      return;
    }
  }
  await playMusicAt(music.index);
}

async function musicPrev() {
  if (!music.playlist.length) return;
  const prev = music.index - 1;
  if (prev < 0) return;
  const wasPlaying = !!(music.audio && !music.audio.paused);
  setMusicIndex(prev);
  if (wasPlaying) await playMusicAt(prev);
}

async function musicNext() {
  if (!music.playlist.length) return;
  const next = music.index + 1;
  if (next >= music.playlist.length) return;
  const wasPlaying = !!(music.audio && !music.audio.paused);
  setMusicIndex(next);
  if (wasPlaying) await playMusicAt(next);
}

async function musicShuffle() {
  if (!music.playlist.length) return;
  const wasPlaying = !!(music.audio && !music.audio.paused);
  resetMusicOrder();
  shuffleArray(music.order);
  setMusicIndex(0);
  if (wasPlaying) await playMusicAt(0);
}

// ─── Server settings ───────────────────────────────────────────

async function postMusicDisplaySettings(patch) {
  try {
    const data = await api('POST', '/api/music/display-settings', patch);
    if (data) {
      if (typeof data.songDisplay === 'string') music.songDisplay = data.songDisplay;
      if (typeof data.writeSongFile === 'boolean') music.writeSongFile = data.writeSongFile;
      if (typeof data.songFilePath === 'string') music.songFilePath = data.songFilePath;
      if (typeof data.songScrollSpeed === 'number') music.songScrollSpeed = data.songScrollSpeed;
      if (typeof data.songTextSize === 'number') music.songTextSize = data.songTextSize;
      syncMusicDisplayUI();
    }
  } catch {}
}

async function postMusicSettings(patch) {
  try {
    const data = await api('POST', '/api/music/settings', patch);
    if (data) {
      if (typeof data.autoShuffle === 'boolean') music.autoShuffle = data.autoShuffle;
      if (typeof data.playlistLoop === 'boolean') music.playlistLoop = data.playlistLoop;
    }
  } catch {}
}

// ─── Debounced settings persistence ────────────────────────────

const saveMusicPlaybackSettings = debounce(async (patch) => {
  try { await api('POST', '/api/music/settings', patch); } catch {}
}, 300);

// ─── Event listeners ───────────────────────────────────────────

export function bindMusicListeners() {
  musicPlayBtn?.addEventListener('click', () => musicTogglePlayPause().catch(() => {}));
  musicPrevBtn?.addEventListener('click', () => musicPrev().catch(() => {}));
  musicNextBtn?.addEventListener('click', () => musicNext().catch(() => {}));
  musicShuffleBtn?.addEventListener('click', () => musicShuffle().catch(() => {}));

  // Volume slider
  let musicVolBeforeMute = 1;
  musicVolSlider?.addEventListener('input', () => {
    const vol = parseFloat(musicVolSlider.value);
    music.volume = vol;
    applyMusicVolume();
    syncMusicVolUI();
    saveMusicPlaybackSettings({ musicVolume: vol });
  });
  musicVolIcon?.addEventListener('click', () => {
    if (music.volume > 0) {
      musicVolBeforeMute = music.volume;
      music.volume = 0;
    } else {
      music.volume = musicVolBeforeMute || 1;
    }
    applyMusicVolume();
    if (musicVolSlider) musicVolSlider.value = music.volume;
    syncMusicVolUI();
    saveMusicPlaybackSettings({ musicVolume: music.volume });
  });

  // Pan slider
  musicPanSlider?.addEventListener('input', () => {
    music.pan = parseFloat(musicPanSlider.value);
    applyMusicPan();
    saveMusicPlaybackSettings({ musicPan: music.pan });
  });
  musicPanSlider?.addEventListener('dblclick', () => {
    music.pan = 0;
    if (musicPanSlider) musicPanSlider.value = 0;
    applyMusicPan();
    saveMusicPlaybackSettings({ musicPan: 0 });
  });

  // Progress bar seek
  musicProgressBar?.addEventListener('input', () => {
    music.seeking = true;
    if (music.audio && Number.isFinite(music.audio.duration)) {
      const t = parseFloat(musicProgressBar.value) * music.audio.duration;
      if (musicTimeCurrent) musicTimeCurrent.textContent = formatTime(t);
    }
  });
  musicProgressBar?.addEventListener('change', () => {
    if (music.audio && Number.isFinite(music.audio.duration)) {
      music.audio.currentTime = parseFloat(musicProgressBar.value) * music.audio.duration;
    }
    music.seeking = false;
  });

  // Browse folder (Electron IPC)
  musicBrowseBtn?.addEventListener('click', async () => {
    let folder = null;
    if (isElectron) {
      folder = await window.challachat.invoke('pick-folder');
    }
    if (!folder) return;
    musicPathInput.value = folder;
    // Save to server settings + reload playlist
    try {
      const data = await api('POST', '/api/music/path', { musicPath: folder });
      if (data?.ok) {
        music.isConfigured = true;
        music.playlist = Array.isArray(data.playlist) ? data.playlist : [];
        music.meta = Array.from({ length: music.playlist.length });
        resetMusicOrder();
        if (music.autoShuffle && music.playlist.length > 1) {
          shuffleArray(music.order);
        }
        setMusicIndex(0);
      }
    } catch {}
  });

  // Display settings
  songDisplaySelect?.addEventListener('change', () => {
    postMusicDisplaySettings({ songDisplay: songDisplaySelect.value });
  });
  scrollSpeedSlider?.addEventListener('input', () => {
    const val = parseFloat(scrollSpeedSlider.value) || 0;
    music.songScrollSpeed = val;
    if (scrollSpeedLabel) scrollSpeedLabel.textContent = `Scroll speed: ${Math.round(val * 100)}%`;
  });
  scrollSpeedSlider?.addEventListener('change', () => {
    postMusicDisplaySettings({ songScrollSpeed: parseFloat(scrollSpeedSlider.value) || 0 });
  });
  songTextSizeSlider?.addEventListener('input', () => {
    const val = parseFloat(songTextSizeSlider.value) || 0;
    music.songTextSize = val;
    if (songTextSizeLabel) songTextSizeLabel.textContent = `Text size: ${Math.round(val * 100)}%`;
  });
  songTextSizeSlider?.addEventListener('change', () => {
    postMusicDisplaySettings({ songTextSize: parseFloat(songTextSizeSlider.value) || 0 });
  });
  writeSongFileToggle?.addEventListener('change', () => {
    music.writeSongFile = writeSongFileToggle.checked;
    postMusicDisplaySettings({ writeSongFile: writeSongFileToggle.checked });
    triggerSongFileWrite();
  });
  songFileBrowseBtn?.addEventListener('click', async () => {
    const filePath = isElectron
      ? await window.challachat.invoke('save-file', {
          title: 'Choose song text file location',
          defaultPath: 'song.txt',
          filters: [{ name: 'Text Files', extensions: ['txt'] }],
        })
      : null;
    if (!filePath) return;
    music.songFilePath = filePath;
    if (songFilePathInput) songFilePathInput.value = filePath;
    await postMusicDisplaySettings({ songFilePath: filePath });
    triggerSongFileWrite();
  });
  songFileClearBtn?.addEventListener('click', async () => {
    music.songFilePath = '';
    if (songFilePathInput) songFilePathInput.value = '';
    await postMusicDisplaySettings({ songFilePath: '' });
  });
  autoShuffleToggle?.addEventListener('change', () => {
    music.autoShuffle = autoShuffleToggle.checked;
    postMusicSettings({ autoShuffle: autoShuffleToggle.checked });
  });
  playlistLoopToggle?.addEventListener('change', () => {
    music.playlistLoop = playlistLoopToggle.checked;
    postMusicSettings({ playlistLoop: playlistLoopToggle.checked });
  });
  externalMusicDataToggle?.addEventListener('change', () => {
    music.externalMusicData = externalMusicDataToggle.checked;
    postMusicSettings({ externalMusicData: externalMusicDataToggle.checked });
  });
}

// ─── Init ──────────────────────────────────────────────────────

export async function initMusic() {
  await fetchMusicConfig();
  if (!music.isConfigured) { syncMusicUI(); return; }
  await loadMusicPlaylist();
  if (music.autoShuffle && music.playlist.length > 1) {
    shuffleArray(music.order);
  }
  setMusicIndex(0);
}
