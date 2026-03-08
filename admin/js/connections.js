/**
 * Connection lifecycle — connect/disconnect, dynamic cards, status polling.
 */
import {
  isElectron,
  logoImg, urlInput, connectBtn, connectError,
  connectionsContainer, overlayUrl, copyBtn,
  dummyChattersToggle, startWithoutConnecting,
  welcomeView, activeView,
  addConnectionCard, addUrlInput, addConnectBtn, closeServerLink,
} from './dom.js';
import { api } from './api.js';
import { debounce } from '/shared/utils.js';

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
  logoImg.src = active ? 'img/challachat-active.png' : 'img/challachat.png';
}

// ─── Dynamic connection cards ──────────────────────────────────

const MAX_CONNECTIONS = 5;
const connectionCards = new Map();
const PLATFORM_ICONS = { youtube: 'img/youtube.png', twitch: 'img/twitch.png', kick: 'img/kick.png' };

function createSpoofCard(conn) {
  const card = document.createElement('section');
  card.className = 'card spoof-card';
  card.dataset.connId = conn.id;
  const intervalMs = conn.spoofIntervalMs || 3000;
  card.innerHTML = `
    <div class="spoof-row">
      <div class="spoof-control">
        <div class="control-label">Spoof Chat</div>
        <select class="dropdown spoof-preset-select">
          <option value="default">Default messages</option>
        </select>
      </div>
      <div class="spoof-control">
        <div class="control-label">Interval (ms)</div>
        <input type="text" class="spoof-interval-input" inputmode="numeric" value="${intervalMs}" />
      </div>
      <button class="btn small danger conn-disconnect-btn">Disconnect</button>
    </div>`;
  card.querySelector('.conn-disconnect-btn').addEventListener('click', () => handleConnectionDisconnect(conn.id));
  const intervalInput = card.querySelector('.spoof-interval-input');
  const sendInterval = debounce(async (ms) => {
    try { await api('POST', '/api/spoof-interval', { intervalMs: ms }); } catch {}
  }, 300);
  intervalInput.addEventListener('input', () => {
    const ms = parseInt(intervalInput.value, 10);
    if (ms >= 500) sendInterval(ms);
  });
  connectionCards.set(conn.id, card);
  connectionsContainer.appendChild(card);
  return card;
}

function createConnectionCard(conn) {
  const card = document.createElement('section');
  card.className = 'card capture-card';
  card.dataset.connId = conn.id;

  const iconSrc = PLATFORM_ICONS[conn.platform] || '';
  card.innerHTML = `
    <div class="capture-header">
      <img class="capture-platform-icon" src="${iconSrc}" alt="${conn.platform || ''}" style="${iconSrc ? '' : 'display:none'}" />
      <span class="capture-url">${conn.url || ''}</span>
      <button class="btn small danger conn-disconnect-btn">Disconnect</button>
    </div>
    <div class="capture-detail-row">
      <div class="capture-stat">
        <span class="capture-stat-value conn-msg-count">${(conn.messageCount || 0).toLocaleString()}</span>
        <span class="capture-stat-label">Messages</span>
      </div>
      <div class="capture-stat">
        <span class="capture-stat-value conn-chatters">${(conn.chatters || 0).toLocaleString()}</span>
        <span class="capture-stat-label">Chatters</span>
      </div>
      <div class="capture-stat">
        <span class="capture-stat-value conn-uptime">${formatUptime(conn.uptime || 0)}</span>
        <span class="capture-stat-label">Uptime</span>
      </div>
      <div class="capture-poll-row">
        <label>Interval</label>
        <input type="range" class="conn-poll-slider" min="100" max="5000" step="100" value="${conn.pollIntervalMs || 1000}" />
        <span class="capture-poll-value conn-poll-value">${formatPoll(conn.pollIntervalMs || 1000)}</span>
      </div>
    </div>`;

  card.querySelector('.conn-disconnect-btn').addEventListener('click', () => handleConnectionDisconnect(conn.id));

  const slider = card.querySelector('.conn-poll-slider');
  const pollVal = card.querySelector('.conn-poll-value');
  const sendPoll = debounce(async (ms) => {
    try { await api('POST', '/api/poll-interval', { pollIntervalMs: ms, connectionId: conn.id }); } catch {}
  }, 300);
  slider.addEventListener('input', () => {
    const ms = Number(slider.value);
    pollVal.textContent = formatPoll(ms);
    sendPoll(ms);
  });

  connectionCards.set(conn.id, card);
  connectionsContainer.appendChild(card);
  return card;
}

function updateConnectionCard(card, conn) {
  card.querySelector('.conn-msg-count').textContent = (conn.messageCount || 0).toLocaleString();
  card.querySelector('.conn-chatters').textContent = (conn.chatters || 0).toLocaleString();
  card.querySelector('.conn-uptime').textContent = formatUptime(conn.uptime || 0);
  const slider = card.querySelector('.conn-poll-slider');
  if (document.activeElement !== slider && conn.pollIntervalMs) {
    slider.value = conn.pollIntervalMs;
    card.querySelector('.conn-poll-value').textContent = formatPoll(conn.pollIntervalMs);
  }
}

function removeConnectionCard(connId) {
  const card = connectionCards.get(connId);
  if (card) { card.remove(); connectionCards.delete(connId); }
}

function updateUI(status) {
  const isActive = status.sessionActive;
  setServerActive(isActive);
  if (status.overlayUrl) overlayUrl.textContent = status.overlayUrl;

  welcomeView.classList.toggle('hidden', isActive);
  activeView.classList.toggle('hidden', !isActive);

  dummyChattersToggle.checked = !!status.dummyChatters;

  const connections = status.connections || [];
  const activeIds = new Set(connections.map(c => c.id));

  for (const [id] of connectionCards) {
    if (!activeIds.has(id)) removeConnectionCard(id);
  }

  for (const conn of connections) {
    const existing = connectionCards.get(conn.id);
    if (existing) {
      if (conn.platform !== 'spoof') updateConnectionCard(existing, conn);
    } else {
      if (conn.platform === 'spoof') createSpoofCard(conn);
      else createConnectionCard(conn);
    }
  }

  const realConnections = connections.filter(c => c.platform !== 'spoof');
  const showAddCard = isActive && realConnections.length < MAX_CONNECTIONS;
  addConnectionCard.classList.toggle('hidden', !showAddCard);

  if (realConnections.length === 0) {
    addUrlInput.placeholder = 'Enter a livestream URL…';
  } else {
    addUrlInput.placeholder = 'Add another livestream URL…';
  }
}

// ─── Status / settings polling ─────────────────────────────────

export async function fetchStatus() {
  try {
    const data = await api('GET', '/api/status');
    if (data) updateUI(data);
  } catch {
    setServerActive(false);
  }
}

// ─── Connect / Disconnect ──────────────────────────────────────

async function handleConnect() {
  const url = urlInput.value.trim();
  if (!url) { showError('Please enter a livestream URL.'); return; }

  hideError();
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
    connectBtn.disabled = false;
    connectBtn.textContent = 'Connect';
  }
}

async function handleAddConnect() {
  const url = addUrlInput.value.trim();
  if (!url) return;
  addConnectBtn.disabled = true;
  addConnectBtn.textContent = 'Connecting\u2026';
  try {
    const data = await api('POST', '/api/connect', { url });
    if (data.ok) {
      addUrlInput.value = '';
    } else {
      alert(data.error || 'Connection failed.');
    }
    await fetchStatus();
  } catch {
    alert('Failed to connect.');
  } finally {
    addConnectBtn.disabled = false;
    addConnectBtn.textContent = 'Connect';
  }
}

async function handleConnectionDisconnect(connectionId) {
  try {
    await api('POST', '/api/disconnect', { connectionId });
    await fetchStatus();
  } catch { /* ignore */ }
}

async function handleStartWithoutConnecting(e) {
  e.preventDefault();
  try {
    await api('POST', '/api/start-session');
    await api('POST', '/api/dummy-chatters', { enabled: true });
    await fetchStatus();
  } catch {}
}

// ─── Event listeners ───────────────────────────────────────────

export function bindConnectionListeners() {
  // Connect / disconnect
  connectBtn.addEventListener('click', handleConnect);
  startWithoutConnecting.addEventListener('click', handleStartWithoutConnecting);
  urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleConnect(); });
  addConnectBtn.addEventListener('click', handleAddConnect);
  addUrlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addConnectBtn.click(); });
  closeServerLink.addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      await api('POST', '/api/end-session');
      await fetchStatus();
    } catch {}
  });

  // Copy overlay URL
  copyBtn.addEventListener('click', () => {
    const text = overlayUrl.textContent;
    navigator.clipboard.writeText(text).then(() => {
      const orig = copyBtn.innerHTML;
      copyBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
      setTimeout(() => { copyBtn.innerHTML = orig; }, 1500);
    }).catch(() => {});
  });

  // Dummy chatters toggle
  dummyChattersToggle.addEventListener('change', async () => {
    try {
      await api('POST', '/api/dummy-chatters', { enabled: dummyChattersToggle.checked });
      await fetchStatus();
    } catch { dummyChattersToggle.checked = !dummyChattersToggle.checked; }
  });

  // Real-time Electron events
  if (isElectron) {
    window.challachat.on('capture-status', () => fetchStatus());
    window.challachat.on('capture-error', (error) => showError(error));
  }
}
