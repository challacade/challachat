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
    bgOpLabel.textContent = 'Background opacity: ' + a.bgOpacity.toFixed(2);
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
});
textOpSlider.addEventListener('input', () => {
  const val = Number(textOpSlider.value);
  textOpLabel.textContent = 'Text opacity: ' + val.toFixed(2);
  presetSelect.value = 'Custom';
  sendAppearance({ textOpacity: val, preset: 'Custom' });
});
bubbleOpSlider.addEventListener('input', () => {
  const val = Number(bubbleOpSlider.value);
  bubbleOpLabel.textContent = 'Bubble opacity: ' + val.toFixed(2);
  presetSelect.value = 'Custom';
  sendAppearance({ bubbleOpacity: val, preset: 'Custom' });
});
bgOpSlider.addEventListener('input', () => {
  const val = Number(bgOpSlider.value);
  bgOpLabel.textContent = 'Background opacity: ' + val.toFixed(2);
  presetSelect.value = 'Custom';
  sendAppearance({ bgOpacity: val, preset: 'Custom' });
});
gapSlider.addEventListener('input', () => {
  const val = Number(gapSlider.value);
  gapLabel.textContent = 'Vertical gap: ' + val.toFixed(2);
  presetSelect.value = 'Custom';
  sendAppearance({ messageGap: val, preset: 'Custom' });
});
textColorPicker.addEventListener('input', () => {
  presetSelect.value = 'Custom';
  sendAppearance({ textColor: textColorPicker.value, preset: 'Custom' });
});
bubbleColorPicker.addEventListener('input', () => {
  presetSelect.value = 'Custom';
  sendAppearance({ bubbleColor: bubbleColorPicker.value, preset: 'Custom' });
});
bgColorPicker.addEventListener('input', () => {
  presetSelect.value = 'Custom';
  sendAppearance({ bgColor: bgColorPicker.value, preset: 'Custom' });
});
showBubblesToggle.addEventListener('change', () => {
  presetSelect.value = 'Custom';
  sendAppearance({ showBubbles: showBubblesToggle.checked, preset: 'Custom' });
});
showAvatarsToggle.addEventListener('change', () => {
  presetSelect.value = 'Custom';
  sendAppearance({ showAvatars: showAvatarsToggle.checked, preset: 'Custom' });
});
showBadgesToggle.addEventListener('change', () => {
  presetSelect.value = 'Custom';
  sendAppearance({ showBadges: showBadgesToggle.checked, preset: 'Custom' });
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
fetchAppearance();
pollTimer = setInterval(() => { fetchStatus(); fetchSettings(); }, isElectron ? 5000 : 2000);
