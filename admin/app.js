/**
 * ChallaChat Admin Panel
 *
 * When running inside Electron the panel uses IPC (window.challachat.invoke /
 * window.challachat.on) for zero-latency communication with the backend.
 * Otherwise it falls back to REST API polling so the admin page also works
 * when opened in a regular browser (terminal mode).
 */

// ─── Feature detect ────────────────────────────────────────────
const isElectron = !!(window.challachat && window.challachat.isElectron);

// ─── DOM refs ──────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const serverDot     = $('serverDot');
const urlInput      = $('urlInput');
const connectBtn    = $('connectBtn');
const connectError  = $('connectError');
const connectSection  = $('connectSection');
const captureSection  = $('captureSection');
const platformBadge   = $('platformBadge');
const captureUrl      = $('captureUrl');
const messageCount    = $('messageCount');
const uptime          = $('uptime');
const pollDisplay     = $('pollDisplay');
const pollSlider      = $('pollSlider');
const pollValue       = $('pollValue');
const disconnectBtn   = $('disconnectBtn');
const overlayUrl      = $('overlayUrl');
const copyBtn         = $('copyBtn');
// Settings
const filterToggle    = $('filterToggle');
const filterReloadBtn = $('filterReloadBtn');
const filterMeta      = $('filterMeta');
const loggerToggle    = $('loggerToggle');
const loggerMeta      = $('loggerMeta');
const jamToggle       = $('jamToggle');
const jamMeta         = $('jamMeta');
// Appearance
const scaleSlider     = $('scaleSlider');
const scaleLabel      = $('scaleLabel');
const textOpSlider    = $('textOpSlider');
const textOpLabel     = $('textOpLabel');
const bubbleOpSlider  = $('bubbleOpSlider');
const bubbleOpLabel   = $('bubbleOpLabel');
const bgOpSlider      = $('bgOpSlider');
const bgOpLabel       = $('bgOpLabel');
const gapSlider       = $('gapSlider');
const gapLabel        = $('gapLabel');
const textColorPicker   = $('textColorPicker');
const bubbleColorPicker = $('bubbleColorPicker');
const bgColorPicker     = $('bgColorPicker');
const showBubblesToggle = $('showBubblesToggle');
const showAvatarsToggle = $('showAvatarsToggle');
const showBadgesToggle  = $('showBadgesToggle');
const presetSelect      = $('presetSelect');
const previewHost       = $('previewHost');
// Sound
const msgVolSlider      = $('msgVolSlider');
const msgVolLabel       = $('msgVolLabel');
const donVolSlider      = $('donVolSlider');
const donVolLabel       = $('donVolLabel');
const memVolSlider      = $('memVolSlider');
const memVolLabel       = $('memVolLabel');
const testMsgBtn        = $('testMsgBtn');
const testDonBtn        = $('testDonBtn');
const testMemBtn        = $('testMemBtn');
// Music
const musicNowPlaying   = $('musicNowPlaying');
const musicPrevBtn      = $('musicPrevBtn');
const musicPlayBtn      = $('musicPlayBtn');
const musicNextBtn      = $('musicNextBtn');
const musicShuffleBtn   = $('musicShuffleBtn');
const musicVolSlider    = $('musicVolSlider');
const musicVolLabel     = $('musicVolLabel');
const musicVolIcon      = $('musicVolIcon');
const musicPathInput    = $('musicPathInput');
const musicBrowseBtn    = $('musicBrowseBtn');
const songDisplaySelect = $('songDisplaySelect');
const scrollSongToggle  = $('scrollSongToggle');
const writeSongFileToggle = $('writeSongFileToggle');
// Navigation
const navHome         = $('navHome');
const navAppearance   = $('navAppearance');
const navSound        = $('navSound');
const navSettings     = $('navSettings');

const pages = {
  home:       $('pageHome'),
  appearance: $('pageAppearance'),
  sound:      $('pageSound'),
  settings:   $('pageSettings'),
};

const navButtons = [navHome, navAppearance, navSound, navSettings];

let pollTimer = null;
let connecting = false;

// ─── Audio system ──────────────────────────────────────────────

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

function playSoundAdmin(handle, vol = 1) {
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

async function initAdminAudio() {
  ensureAudioCtx();
  adminAudio.message  = await loadAudioBuffer('/sounds/message.mp3');
  adminAudio.donation = await loadAudioBuffer('/sounds/donation.mp3');
  adminAudio.member   = await loadAudioBuffer('/sounds/member.mp3');
}

// ─── SSE connection (for play-sound events) ────────────────────

function startAdminSSE() {
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
  es.addEventListener('music-control', (event) => {
    try {
      const data = JSON.parse(event.data);
      const action = data?.action;
      if (action === 'playPause') musicTogglePlayPause().catch(() => {});
      else if (action === 'prev') musicPrev().catch(() => {});
      else if (action === 'next') musicNext().catch(() => {});
      else if (action === 'shuffle') musicShuffle().catch(() => {});
    } catch {}
  });
  es.addEventListener('error', () => {
    // Auto-reconnect is built into EventSource
  });
}

// ─── Music player ──────────────────────────────────────────────

const music = {
  playlist: [],    // array of file paths from server
  meta: [],        // array of { title, artist } per server index
  order: [],       // shuffle-aware index mapping
  index: 0,        // position in order[]
  audio: null,     // HTMLAudioElement
  gainNode: null,  // GainNode for volume amplification
  playlistLoop: true,
  autoShuffle: false,
  isConfigured: false,
  songDisplay: 'none',
  writeSongFile: false,
  scrollSongDisplay: false,
  volume: 1,
};

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
  const resp = await fetch(`/api/music/track/${serverIndex}/meta`, { cache: 'no-store' });
  if (!resp.ok) throw new Error('HTTP error');
  return resp.json();
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

function syncMusicUI() {
  // Title
  if (musicNowPlaying) {
    musicNowPlaying.textContent = displayTitle(music.index);
    // Lazy-load ID3 meta then update
    if (music.playlist.length) {
      const snap = serverIndexAtPos(music.index);
      void ensureMetaLoaded(snap).then(() => {
        if (serverIndexAtPos(music.index) === snap) {
          musicNowPlaying.textContent = displayTitle(music.index);
          // Re-notify server with metadata title (initial post may have used filename fallback)
          void postJsonQuiet('/api/music/nowplaying', { index: snap, songId: displayTitle(music.index) });
          if (music.writeSongFile) {
            void postJsonQuiet('/api/music/songfile', { index: snap, songId: displayTitle(music.index) });
          }
        }
      });
    }
  }
  // Play/Pause button
  if (musicPlayBtn) {
    const playing = !!(music.audio && !music.audio.paused);
    musicPlayBtn.textContent = playing ? '⏸' : '▶';
  }
  // Notify server of now-playing
  const si = serverIndexAtPos(music.index);
  void postJsonQuiet('/api/music/nowplaying', { index: si, songId: displayTitle(music.index) });
  // Write song file if enabled
  if (music.writeSongFile && music.playlist.length) {
    void postJsonQuiet('/api/music/songfile', { index: si, songId: displayTitle(music.index) });
  }
}

async function postJsonQuiet(url, body) {
  try {
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch {}
}

function setMusicIndex(i) {
  if (!music.playlist.length) { music.index = 0; syncMusicUI(); return; }
  music.index = Math.max(0, Math.min(music.playlist.length - 1, Number(i) || 0));
  syncMusicUI();
}

async function loadMusicPlaylist() {
  try {
    const resp = await fetch('/api/music/playlist', { cache: 'no-store' });
    if (!resp.ok) return;
    const data = await resp.json();
    const list = Array.isArray(data?.playlist) ? data.playlist : [];
    music.playlist = list;
    music.meta = Array.from({ length: list.length });
    resetMusicOrder();
  } catch {}
}

async function fetchMusicConfig() {
  try {
    const resp = await fetch('/api/music', { cache: 'no-store' });
    if (!resp.ok) return;
    const data = await resp.json();
    const mPath = typeof data?.musicPath === 'string' ? data.musicPath.trim() : '';
    music.isConfigured = !!mPath;
    music.playlistLoop = data?.playlistLoop !== false;
    music.autoShuffle = data?.autoShuffle === true;
    if (musicPathInput) musicPathInput.value = mPath || '';
    // Display settings are included in the main music config response
    if (typeof data?.songDisplay === 'string') music.songDisplay = data.songDisplay;
    if (typeof data?.writeSongFile === 'boolean') music.writeSongFile = data.writeSongFile;
    if (typeof data?.scrollSongDisplay === 'boolean') music.scrollSongDisplay = data.scrollSongDisplay;
    syncMusicDisplayUI();
  } catch {}
}

async function initMusic() {
  await fetchMusicConfig();
  if (!music.isConfigured) { syncMusicUI(); return; }
  await loadMusicPlaylist();
  if (music.autoShuffle && music.playlist.length > 1) {
    shuffleArray(music.order);
  }
  setMusicIndex(0);
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
    source.connect(music.gainNode);
    music.gainNode.connect(actx.destination);
    music.audio.addEventListener('play', () => syncMusicUI());
    music.audio.addEventListener('pause', () => syncMusicUI());
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
  applyMusicVolume();
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

// Music control bindings
musicPlayBtn?.addEventListener('click', () => musicTogglePlayPause().catch(() => {}));
musicPrevBtn?.addEventListener('click', () => musicPrev().catch(() => {}));
musicNextBtn?.addEventListener('click', () => musicNext().catch(() => {}));
musicShuffleBtn?.addEventListener('click', () => musicShuffle().catch(() => {}));

// Volume slider
let musicVolBeforeMute = 1;
musicVolSlider?.addEventListener('input', () => {
  const vol = parseFloat(musicVolSlider.value);
  music.volume = vol;
  if (music.audio) applyMusicVolume();
  syncMusicVolUI();
});
musicVolIcon?.addEventListener('click', () => {
  if (music.volume > 0) {
    musicVolBeforeMute = music.volume;
    music.volume = 0;
  } else {
    music.volume = musicVolBeforeMute || 1;
  }
  if (music.audio) applyMusicVolume();
  if (musicVolSlider) musicVolSlider.value = music.volume;
  syncMusicVolUI();
});

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
    const resp = await fetch('/api/music/path', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ musicPath: folder }),
    });
    const data = await resp.json();
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

// SSE music-control events (from terminal hotkeys)
// Handled in startAdminSSE below

function syncMusicDisplayUI() {
  if (songDisplaySelect) songDisplaySelect.value = music.songDisplay || 'none';
  if (scrollSongToggle) scrollSongToggle.checked = !!music.scrollSongDisplay;
  if (writeSongFileToggle) writeSongFileToggle.checked = !!music.writeSongFile;
}

async function postMusicDisplaySettings(patch) {
  try {
    const resp = await fetch('/api/music/display-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await resp.json();
    if (data) {
      if (typeof data.songDisplay === 'string') music.songDisplay = data.songDisplay;
      if (typeof data.writeSongFile === 'boolean') music.writeSongFile = data.writeSongFile;
      if (typeof data.scrollSongDisplay === 'boolean') music.scrollSongDisplay = data.scrollSongDisplay;
      syncMusicDisplayUI();
    }
  } catch {}
}

songDisplaySelect?.addEventListener('change', () => {
  postMusicDisplaySettings({ songDisplay: songDisplaySelect.value });
});
scrollSongToggle?.addEventListener('change', () => {
  postMusicDisplaySettings({ scrollSongDisplay: scrollSongToggle.checked });
});
writeSongFileToggle?.addEventListener('change', () => {
  music.writeSongFile = writeSongFileToggle.checked;
  postMusicDisplaySettings({ writeSongFile: writeSongFileToggle.checked });
});

// ─── Helpers ───────────────────────────────────────────────────

function formatUptime(ms) {
  if (!ms || ms <= 0) return '0s';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return `${m}m ${rs}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm}m`;
}

function formatPoll(ms) {
  if (ms >= 1000) return (ms / 1000).toFixed(1).replace(/\.0$/, '') + ' s';
  return ms + ' ms';
}

function showError(msg) {
  connectError.textContent = msg;
  connectError.classList.remove('hidden');
}
function hideError() {
  connectError.classList.add('hidden');
}

function setServerActive(active) {
  serverDot.className = 'status-dot' + (active ? ' active' : '');
}

// ─── Page navigation ───────────────────────────────────────────

function switchPage(pageName) {
  // Hide all pages, de-activate all nav buttons
  for (const [name, el] of Object.entries(pages)) {
    el.classList.toggle('active', name === pageName);
  }
  navButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === pageName);
  });
}

navButtons.forEach(btn => {
  btn.addEventListener('click', () => switchPage(btn.dataset.page));
});

// ─── Generic API helper (IPC or HTTP) ──────────────────────────

async function api(method, path, body) {
  if (isElectron) {
    // IPC calls — map REST paths to IPC channels
    if (path === '/api/status')          return window.challachat.invoke('get-status');
    if (path === '/api/connect')         return window.challachat.invoke('connect', body?.url);
    if (path === '/api/disconnect')      return window.challachat.invoke('disconnect');
    // Settings go through REST even in Electron (served on localhost)
    // Fall through to fetch
  }
  const opts = { method };
  if (body) {
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  return res.json();
}

// ─── Status polling ────────────────────────────────────────────

async function fetchStatus() {
  try {
    const data = await api('GET', '/api/status');
    if (data) updateUI(data);
  } catch {
    setServerActive(false);
  }
}

function updateUI(status) {
  setServerActive(true);
  if (status.overlayUrl) overlayUrl.textContent = status.overlayUrl;

  if (status.isRunning) {
    connectSection.classList.add('hidden');
    captureSection.classList.remove('hidden');

    const p = status.platform || 'unknown';
    platformBadge.textContent = p;
    platformBadge.className = 'platform-badge ' + p;

    captureUrl.textContent = status.url || '';
    messageCount.textContent = (status.messageCount || 0).toLocaleString();
    uptime.textContent = formatUptime(status.uptime || 0);

    if (status.pollIntervalMs) {
      pollDisplay.textContent = formatPoll(status.pollIntervalMs);
      pollSlider.value = status.pollIntervalMs;
      pollValue.textContent = formatPoll(status.pollIntervalMs);
    }
  } else {
    if (!connecting) connectSection.classList.remove('hidden');
    captureSection.classList.add('hidden');
  }
}

// ─── Settings fetch ────────────────────────────────────────────

async function fetchSettings() {
  try {
    const [filter, logger, jam] = await Promise.all([
      api('GET', '/api/filter'),
      api('GET', '/api/logger'),
      api('GET', '/api/jam'),
    ]);
    updateFilterUI(filter);
    updateLoggerUI(logger);
    updateJamUI(jam);
  } catch {
    // Server may not be ready yet — ignore
  }
}

function updateFilterUI(f) {
  if (!f) return;
  filterToggle.checked = f.active;
  filterMeta.textContent = f.loaded
    ? `${f.wordCount} words loaded`
    : 'No word list loaded';
}

function updateLoggerUI(l) {
  if (!l) return;
  loggerToggle.checked = l.enabled;
  if (l.logging) {
    loggerMeta.textContent = `Logging (${l.messageCount} msgs)`;
  } else {
    loggerMeta.textContent = l.enabled ? 'Enabled, waiting for capture' : 'Disabled';
  }
}

function updateJamUI(j) {
  if (!j) return;
  jamToggle.checked = j.enabled;
  if (j.enabled && j.jamCount > 0) {
    jamMeta.textContent = `${j.jamCount} jams`;
  } else {
    jamMeta.textContent = j.enabled ? 'Enabled' : 'Disabled';
  }
}

// ─── Connect / Disconnect ──────────────────────────────────────

async function handleConnect() {
  const url = urlInput.value.trim();
  if (!url) { showError('Please enter a livestream URL.'); return; }

  hideError();
  connecting = true;
  connectBtn.disabled = true;
  connectBtn.textContent = 'Connecting\u2026';

  try {
    const data = await api('POST', '/api/connect', { url });
    if (!data.ok) {
      showError(data.error || 'Connection failed.');
    } else {
      hideError();
      urlInput.value = '';
    }
    await fetchStatus();
  } catch {
    showError('Failed to connect. Is the server running?');
  } finally {
    connecting = false;
    connectBtn.disabled = false;
    connectBtn.textContent = 'Connect';
  }
}

async function handleDisconnect() {
  disconnectBtn.disabled = true;
  disconnectBtn.textContent = 'Disconnecting\u2026';
  try {
    await api('POST', '/api/disconnect');
    await fetchStatus();
  } catch { /* ignore */ }
  finally {
    disconnectBtn.disabled = false;
    disconnectBtn.textContent = 'Disconnect';
  }
}

// ─── Poll interval ─────────────────────────────────────────────

let pollDebounce = null;
pollSlider.addEventListener('input', () => {
  const ms = Number(pollSlider.value);
  pollValue.textContent = formatPoll(ms);
  pollDisplay.textContent = formatPoll(ms);
  clearTimeout(pollDebounce);
  pollDebounce = setTimeout(async () => {
    try { await api('POST', '/api/poll-interval', { pollIntervalMs: ms }); } catch {}
  }, 300);
});

// ─── Settings toggles ──────────────────────────────────────────

filterToggle.addEventListener('change', async () => {
  try {
    const data = await api('POST', '/api/filter/toggle', { active: filterToggle.checked });
    updateFilterUI(data);
  } catch { filterToggle.checked = !filterToggle.checked; }
});

filterReloadBtn.addEventListener('click', async () => {
  filterReloadBtn.disabled = true;
  try {
    const data = await api('POST', '/api/filter/reload');
    updateFilterUI(data);
  } catch {}
  finally { filterReloadBtn.disabled = false; }
});

loggerToggle.addEventListener('change', async () => {
  try {
    const data = await api('POST', '/api/logger/toggle', { enabled: loggerToggle.checked });
    updateLoggerUI(data);
  } catch { loggerToggle.checked = !loggerToggle.checked; }
});

jamToggle.addEventListener('change', async () => {
  try {
    const data = await api('POST', '/api/jam/toggle', { enabled: jamToggle.checked });
    updateJamUI(data);
  } catch { jamToggle.checked = !jamToggle.checked; }
});

// ─── Appearance ────────────────────────────────────────────────

const PRESETS = {
  Dark: {
    scale: 1.35, messageGap: 0.5,
    textColor: '#ffffff', bubbleColor: '#ffffff', bgColor: '#000000',
    textOpacity: 1, bubbleOpacity: 0.14, bgOpacity: 1,
    showBubbles: true, showAvatars: true, showBadges: true
  },
  Light: {
    scale: 1.35, messageGap: 0.5,
    textColor: '#111111', bubbleColor: '#000000', bgColor: '#ffffff',
    textOpacity: 1, bubbleOpacity: 0.08, bgOpacity: 1,
    showBubbles: true, showAvatars: true, showBadges: true
  },
  Transparent: {
    scale: 1.35, messageGap: 0.4,
    textColor: '#ffffff', bubbleColor: '#ffffff', bgColor: '#000000',
    textOpacity: 1, bubbleOpacity: 0.14, bgOpacity: 0,
    showBubbles: false, showAvatars: true, showBadges: true
  }
};

// ─── Live preview (Shadow DOM) ─────────────────────────────────
let previewShadow = null;

async function initPreview() {
  if (!previewHost || previewShadow) return;
  try {
    const res = await fetch('/styles.css');
    const overlayCss = await res.text();
    previewShadow = previewHost.attachShadow({ mode: 'open' });

    // Google Fonts link for the overlay font
    const fontLink = document.createElement('link');
    fontLink.rel = 'stylesheet';
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap';
    previewShadow.appendChild(fontLink);

    const style = document.createElement('style');
    style.textContent = overlayCss + `\n
      /* Preview overrides – :root vars don't inherit into shadow DOM,
         so we re-declare them on the wrapper which scopes all children. */
      :host { display: block; }
      .preview-wrap {
        --base-scale: 1;
        --scale: var(--base-scale);
        --message-gap: 0.4;
        --text: #fff;
        --bubble: rgba(0,0,0,0.35);
        --bubble-blur: blur(8px);
        --primary: #00b5ff;
        --emote-scale: 0.95;
        border-radius: 8px;
        padding: 12px 10px;
        overflow: hidden;
        transition: background 0.15s;
        font-family: Inter, "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", system-ui, sans-serif;
      }
      .messages {
        position: relative !important;
        inset: unset !important;
      }
      .message { animation: none !important; }
      /* hide overlay-only UI */
      .settings-btn, .settings, .toast, .song-display-overlay { display: none !important; }
    `;
    previewShadow.appendChild(style);

    const wrap = document.createElement('div');
    wrap.className = 'preview-wrap';
    wrap.innerHTML = `
      <div class="overlay">
        <div class="messages" style="position:relative;inset:unset;">
          <div class="message single-line ring-mod">
            <div class="avatar"><img src="https://api.dicebear.com/9.x/thumbs/svg?seed=mod" alt="avatar" /></div>
            <div class="body">
              <span class="header"><span class="name">ModUser</span></span>
              <span class="content"> Welcome to the stream!</span>
            </div>
          </div>
          <div class="message single-line">
            <div class="avatar"><img src="https://api.dicebear.com/9.x/thumbs/svg?seed=viewer" alt="avatar" /></div>
            <div class="body">
              <span class="header no-inline-badges"><span class="name">Viewer123</span></span>
              <span class="content"> This is a chat message preview</span>
            </div>
          </div>
        </div>
      </div>
    `;
    previewShadow.appendChild(wrap);
  } catch (e) {
    console.warn('Preview init failed:', e);
  }
}

function updatePreview() {
  if (!previewShadow) return;
  const wrap = previewShadow.querySelector('.preview-wrap');
  const overlay = previewShadow.querySelector('.overlay');
  if (!wrap || !overlay) return;

  const scale = Number(scaleSlider.value) || 1;
  const textOp = Number(textOpSlider.value);
  const bubbleOp = Number(bubbleOpSlider.value);
  const bgOp = Number(bgOpSlider.value);
  const gap = Number(gapSlider.value);
  const textHex = textColorPicker.value.replace('#', '');
  const bubbleHex = bubbleColorPicker.value.replace('#', '');
  const bgHex = bgColorPicker.value.replace('#', '');
  const showBubbles = showBubblesToggle.checked;

  const tr = parseInt(textHex.slice(0,2),16), tg = parseInt(textHex.slice(2,4),16), tb = parseInt(textHex.slice(4,6),16);
  const br2 = parseInt(bubbleHex.slice(0,2),16), bg2 = parseInt(bubbleHex.slice(2,4),16), bb = parseInt(bubbleHex.slice(4,6),16);
  const pr = parseInt(bgHex.slice(0,2),16), pg = parseInt(bgHex.slice(2,4),16), pb = parseInt(bgHex.slice(4,6),16);

  // Preview uses a fixed scale for readability — we apply a clamped version
  const previewScale = Math.max(0.55, Math.min(1.1, scale * 0.65));
  wrap.style.setProperty('--base-scale', String(previewScale));
  wrap.style.setProperty('--scale', String(previewScale));
  wrap.style.setProperty('--message-gap', String(gap));
  wrap.style.setProperty('--text', `rgba(${tr},${tg},${tb},${Math.max(0, Math.min(1, textOp))})`);

  const bubbleOpVal = showBubbles ? bubbleOp : 0;
  wrap.style.setProperty('--bubble', `rgba(${br2},${bg2},${bb},${bubbleOpVal})`);
  wrap.style.setProperty('--bubble-blur', bubbleOpVal > 0 ? 'blur(8px)' : 'none');
  wrap.style.background = `rgba(${pr},${pg},${pb},${Math.max(0, Math.min(1, bgOp))})`;  

  overlay.classList.toggle('no-bubbles', !showBubbles);
  overlay.classList.toggle('no-avatars', !showAvatarsToggle.checked);
  overlay.classList.toggle('no-badges', !showBadgesToggle.checked);
}

async function fetchAppearance() {
  try {
    const data = await api('GET', '/api/appearance');
    if (data) updateAppearanceUI(data);
  } catch {}
}

function updateAppearanceUI(a) {
  if (typeof a.scale === 'number') {
    scaleSlider.value = a.scale;
    scaleLabel.textContent = 'Scale: ' + a.scale.toFixed(2);
  }
  if (typeof a.textOpacity === 'number') {
    textOpSlider.value = a.textOpacity;
    textOpLabel.textContent = 'Text opacity: ' + a.textOpacity.toFixed(2);
  }
  if (typeof a.bubbleOpacity === 'number') {
    bubbleOpSlider.value = a.bubbleOpacity;
    bubbleOpLabel.textContent = 'Bubble opacity: ' + a.bubbleOpacity.toFixed(2);
  }
  if (typeof a.bgOpacity === 'number') {
    bgOpSlider.value = a.bgOpacity;
    bgOpLabel.textContent = 'Back opacity: ' + a.bgOpacity.toFixed(2);
  }
  if (typeof a.messageGap === 'number') {
    gapSlider.value = a.messageGap;
    gapLabel.textContent = 'Vertical gap: ' + a.messageGap.toFixed(2);
  }
  if (typeof a.textColor === 'string') {
    textColorPicker.value = a.textColor;
  }
  if (typeof a.bubbleColor === 'string') {
    bubbleColorPicker.value = a.bubbleColor;
  }
  if (typeof a.bgColor === 'string') {
    bgColorPicker.value = a.bgColor;
  }
  if (typeof a.showBubbles === 'boolean') {
    showBubblesToggle.checked = a.showBubbles;
  }
  if (typeof a.showAvatars === 'boolean') {
    showAvatarsToggle.checked = a.showAvatars;
  }
  if (typeof a.showBadges === 'boolean') {
    showBadgesToggle.checked = a.showBadges;
  }
  if (typeof a.preset === 'string') {
    presetSelect.value = a.preset;
  }
  updatePreview();
}

let appearanceDebounce = null;
function sendAppearance(patch) {
  clearTimeout(appearanceDebounce);
  appearanceDebounce = setTimeout(async () => {
    try { await api('POST', '/api/appearance', patch); } catch {}
  }, 150);
}

scaleSlider.addEventListener('input', () => {
  const val = Number(scaleSlider.value);
  scaleLabel.textContent = 'Scale: ' + val.toFixed(2);
  presetSelect.value = 'Custom';
  sendAppearance({ scale: val, preset: 'Custom' });
  updatePreview();
});
textOpSlider.addEventListener('input', () => {
  const val = Number(textOpSlider.value);
  textOpLabel.textContent = 'Text opacity: ' + val.toFixed(2);
  presetSelect.value = 'Custom';
  sendAppearance({ textOpacity: val, preset: 'Custom' });
  updatePreview();
});
bubbleOpSlider.addEventListener('input', () => {
  const val = Number(bubbleOpSlider.value);
  bubbleOpLabel.textContent = 'Bubble opacity: ' + val.toFixed(2);
  presetSelect.value = 'Custom';
  sendAppearance({ bubbleOpacity: val, preset: 'Custom' });
  updatePreview();
});
bgOpSlider.addEventListener('input', () => {
  const val = Number(bgOpSlider.value);
  bgOpLabel.textContent = 'Back opacity: ' + val.toFixed(2);
  presetSelect.value = 'Custom';
  sendAppearance({ bgOpacity: val, preset: 'Custom' });
  updatePreview();
});
gapSlider.addEventListener('input', () => {
  const val = Number(gapSlider.value);
  gapLabel.textContent = 'Vertical gap: ' + val.toFixed(2);
  presetSelect.value = 'Custom';
  sendAppearance({ messageGap: val, preset: 'Custom' });
  updatePreview();
});
textColorPicker.addEventListener('input', () => {
  presetSelect.value = 'Custom';
  sendAppearance({ textColor: textColorPicker.value, preset: 'Custom' });
  updatePreview();
});
bubbleColorPicker.addEventListener('input', () => {
  presetSelect.value = 'Custom';
  sendAppearance({ bubbleColor: bubbleColorPicker.value, preset: 'Custom' });
  updatePreview();
});
bgColorPicker.addEventListener('input', () => {
  presetSelect.value = 'Custom';
  sendAppearance({ bgColor: bgColorPicker.value, preset: 'Custom' });
  updatePreview();
});
showBubblesToggle.addEventListener('change', () => {
  presetSelect.value = 'Custom';
  sendAppearance({ showBubbles: showBubblesToggle.checked, preset: 'Custom' });
  updatePreview();
});
showAvatarsToggle.addEventListener('change', () => {
  presetSelect.value = 'Custom';
  sendAppearance({ showAvatars: showAvatarsToggle.checked, preset: 'Custom' });
  updatePreview();
});
showBadgesToggle.addEventListener('change', () => {
  presetSelect.value = 'Custom';
  sendAppearance({ showBadges: showBadgesToggle.checked, preset: 'Custom' });
  updatePreview();
});
presetSelect.addEventListener('change', () => {
  const name = presetSelect.value;
  const p = PRESETS[name];
  if (p) {
    updateAppearanceUI({ ...p, preset: name });
    sendAppearance({ ...p, preset: name });
  } else {
    sendAppearance({ preset: 'Custom' });
  }
});

// ─── Copy overlay URL ──────────────────────────────────────────

copyBtn.addEventListener('click', () => {
  const text = overlayUrl.textContent;
  navigator.clipboard.writeText(text).then(() => {
    const orig = copyBtn.textContent;
    copyBtn.textContent = '\u2713';
    setTimeout(() => { copyBtn.textContent = orig; }, 1500);
  }).catch(() => {});
});

// ─── Sound controls ────────────────────────────────────────────

let soundDebounce = null;
function sendSounds(patch) {
  clearTimeout(soundDebounce);
  soundDebounce = setTimeout(async () => {
    try { await api('POST', '/api/sounds', patch); } catch {}
  }, 150);
}

async function fetchSounds() {
  try {
    const data = await api('GET', '/api/sounds');
    if (!data) return;
    if (typeof data.messageVolume === 'number') {
      msgVolSlider.value = data.messageVolume;
      msgVolLabel.textContent = 'Message: ' + Math.round(data.messageVolume * 100) + '%';
    }
    if (typeof data.donationVolume === 'number') {
      donVolSlider.value = data.donationVolume;
      donVolLabel.textContent = 'Donation: ' + Math.round(data.donationVolume * 100) + '%';
    }
    if (typeof data.memberVolume === 'number') {
      memVolSlider.value = data.memberVolume;
      memVolLabel.textContent = 'Membership: ' + Math.round(data.memberVolume * 100) + '%';
    }
  } catch {}
}

msgVolSlider.addEventListener('input', () => {
  const val = Number(msgVolSlider.value);
  msgVolLabel.textContent = 'Message: ' + Math.round(val * 100) + '%';
  sendSounds({ messageVolume: val });
});
donVolSlider.addEventListener('input', () => {
  const val = Number(donVolSlider.value);
  donVolLabel.textContent = 'Donation: ' + Math.round(val * 100) + '%';
  sendSounds({ donationVolume: val });
});
memVolSlider.addEventListener('input', () => {
  const val = Number(memVolSlider.value);
  memVolLabel.textContent = 'Membership: ' + Math.round(val * 100) + '%';
  sendSounds({ memberVolume: val });
});

testMsgBtn.addEventListener('click', async () => {
  ensureAudioCtx();
  if (!adminAudio.message) await initAdminAudio();
  playSoundAdmin(adminAudio.message, Number(msgVolSlider.value) || 0);
});
testDonBtn.addEventListener('click', async () => {
  ensureAudioCtx();
  if (!adminAudio.donation) await initAdminAudio();
  playSoundAdmin(adminAudio.donation, Number(donVolSlider.value) || 0);
});
testMemBtn.addEventListener('click', async () => {
  ensureAudioCtx();
  if (!adminAudio.member) await initAdminAudio();
  playSoundAdmin(adminAudio.member, Number(memVolSlider.value) || 0);
});

// ─── Key bindings ──────────────────────────────────────────────

connectBtn.addEventListener('click', handleConnect);
disconnectBtn.addEventListener('click', handleDisconnect);
urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleConnect(); });

// ─── Real-time Electron events ─────────────────────────────────

if (isElectron) {
  window.challachat.on('capture-status', () => { fetchStatus(); fetchSettings(); });
  window.challachat.on('capture-error', (error) => showError(error));
}

// ─── Init ──────────────────────────────────────────────────────

fetchStatus();
fetchSettings();
fetchSounds();
initPreview().then(() => fetchAppearance());
initAdminAudio().catch(() => {});
initMusic().catch(() => {});
startAdminSSE();
pollTimer = setInterval(() => { fetchStatus(); fetchSettings(); }, isElectron ? 5000 : 2000);
