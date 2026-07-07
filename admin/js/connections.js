/**
 * Connection lifecycle - connect/disconnect, dynamic cards, status polling.
 */
import {
  isElectron,
  logoImg, urlInput, connectBtn, connectError,
  connectionsContainer, overlayUrl, copyBtn,
  startWithoutConnecting,
  welcomeView, activeView,
  addConnectionCard, addUrlInput, addConnectBtn, closeServerLink, startSpoofLink,
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

function formatDisplayUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./i, '');
    const path = `${parsed.pathname}${parsed.search}`.replace(/\/$/, '');
    return `${host}${path}`;
  } catch {
    return String(url || '').replace(/^https?:\/\/(?:www\.)?/i, '');
  }
}

function getConnectionStatus(conn) {
  const raw = String(conn.status || conn.captureStatus || (conn.active === false ? 'inactive' : 'active')).toLowerCase();
  if (['problem', 'warning', 'degraded', 'reconnecting'].includes(raw)) return 'problem';
  if (['inactive', 'stopped', 'error', 'failed', 'disconnected'].includes(raw)) return 'inactive';
  return 'active';
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

const MAX_CONNECTIONS = 10;
const connectionCards = new Map();
const PLATFORM_ICONS = { youtube: 'img/youtube.png', twitch: 'img/twitch.png', kick: 'img/kick.png' };
const SPOOF_OPTIONS = [
  { value: 'welcome', label: 'Welcome' },
  { value: 'trailer', label: 'Trailer' },
  { value: 'audience', label: 'Audience' },
  { value: 'custom', label: 'Custom' },
];

function openSelector({ title, items, pageSize = 8, actionLabel = 'Connect', onSelect }) {
  let page = 0;
  const selected = new Set();
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const overlay = document.createElement('div');
  overlay.className = 'selector-overlay';
  overlay.innerHTML = `
    <section class="selector-dialog" role="dialog" aria-modal="true" aria-label="${title}">
      <div class="selector-header">
        <h3>${title}</h3>
      </div>
      <div class="selector-list"></div>
      <div class="selector-pagination hidden">
        <button class="btn compact primary selector-prev" type="button">Previous</button>
        <span class="selector-page-label"></span>
        <button class="btn compact primary selector-next" type="button">Next</button>
      </div>
      <div class="selector-footer">
        <span class="selector-selected-count">0 selected</span>
        <button class="btn small primary selector-submit" type="button" disabled>${actionLabel}</button>
      </div>
    </section>`;
  const dialog = overlay.querySelector('.selector-dialog');
  const list = overlay.querySelector('.selector-list');
  const pagination = overlay.querySelector('.selector-pagination');
  const pageLabel = overlay.querySelector('.selector-page-label');
  const prevBtn = overlay.querySelector('.selector-prev');
  const nextBtn = overlay.querySelector('.selector-next');
  const submitBtn = overlay.querySelector('.selector-submit');
  const selectedCount = overlay.querySelector('.selector-selected-count');
  const close = () => overlay.remove();
  const updateSelectedState = () => {
    selectedCount.textContent = `${selected.size} selected`;
    submitBtn.disabled = selected.size === 0;
  };
  const render = () => {
    const start = page * pageSize;
    const visible = items.slice(start, start + pageSize);
    list.innerHTML = visible.map((item, index) => `
      <label class="selector-option ${selected.has(item.value) ? 'selected' : ''}">
        <input type="checkbox" class="selector-checkbox" data-index="${start + index}" ${selected.has(item.value) ? 'checked' : ''} />
        <span class="selector-option-text">${item.label}</span>
      </label>`).join('');
    pagination.classList.toggle('hidden', pageCount <= 1);
    pageLabel.textContent = `Page ${page + 1} of ${pageCount}`;
    prevBtn.disabled = page === 0;
    nextBtn.disabled = page >= pageCount - 1;
    updateSelectedState();
  };
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  prevBtn.addEventListener('click', () => { if (page > 0) { page--; render(); } });
  nextBtn.addEventListener('click', () => { if (page < pageCount - 1) { page++; render(); } });
  list.addEventListener('change', (e) => {
    const checkbox = e.target.closest('.selector-checkbox');
    if (!checkbox) return;
    const item = items[Number(checkbox.dataset.index)];
    if (!item) return;
    if (checkbox.checked) selected.add(item.value);
    else selected.delete(item.value);
    render();
  });
  submitBtn.addEventListener('click', async () => {
    const selectedItems = items.filter(item => selected.has(item.value));
    if (selectedItems.length === 0) return;
    submitBtn.disabled = true;
    try { await onSelect(selectedItems); close(); }
    catch { submitBtn.disabled = false; updateSelectedState(); }
  });
  document.addEventListener('keydown', function onKeyDown(e) {
    if (!overlay.isConnected) {
      document.removeEventListener('keydown', onKeyDown);
      return;
    }
    if (e.key === 'Escape') close();
  });
  document.body.appendChild(overlay);
  render();
  dialog.focus?.();
}

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
          <option value="welcome">Welcome</option>
          <option value="trailer">Trailer</option>
          <option value="audience">Audience</option>
          <option value="custom">Custom</option>
        </select>
      </div>
      <div class="spoof-control">
        <div class="control-label">Interval (ms)</div>
        <input type="text" class="spoof-interval-input" inputmode="numeric" value="${intervalMs}" />
      </div>
      <button class="btn small danger conn-disconnect-btn">Disconnect</button>
    </div>`;
  card.querySelector('.conn-disconnect-btn').addEventListener('click', () => handleConnectionDisconnect(conn.id));
  const presetSelect = card.querySelector('.spoof-preset-select');
  presetSelect.addEventListener('change', async () => {
    try { await api('POST', '/api/spoof-preset', { preset: presetSelect.value, connectionId: conn.id }); } catch {}
  });
  const intervalInput = card.querySelector('.spoof-interval-input');
  const sendInterval = debounce(async (ms) => {
    try { await api('POST', '/api/spoof-interval', { intervalMs: ms, connectionId: conn.id }); } catch {}
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
  const status = getConnectionStatus(conn);

  const iconSrc = PLATFORM_ICONS[conn.platform] || '';
  card.innerHTML = `
    <div class="capture-header">
      <div class="connection-status status-${status}" tabindex="0" aria-label="Connection ${status}">
        <span class="connection-status-dot"></span>
      </div>
      <img class="capture-platform-icon" src="${iconSrc}" alt="${conn.platform || ''}" style="${iconSrc ? '' : 'display:none'}" />
      <span class="capture-url" title="${conn.url || ''}">${formatDisplayUrl(conn.url)}</span>
      <div class="capture-inline-stats" aria-label="Connection stats">
        <div class="capture-inline-stat"><strong class="conn-msg-count">${(conn.messageCount || 0).toLocaleString()}</strong><span>Messages</span></div>
        <div class="capture-inline-stat"><strong class="conn-uptime">${formatUptime(conn.uptime || 0)}</strong><span>Uptime</span></div>
      </div>
      <button class="btn small primary conn-refresh-btn">Refresh</button>
      <button class="btn small danger conn-disconnect-btn">Disconnect</button>
    </div>`;

  card.querySelector('.conn-refresh-btn').addEventListener('click', () => handleConnectionRefresh(conn.id, conn.url || ''));
  card.querySelector('.conn-disconnect-btn').addEventListener('click', () => handleConnectionDisconnect(conn.id));

  connectionCards.set(conn.id, card);
  connectionsContainer.appendChild(card);
  return card;
}

function updateConnectionCard(card, conn) {
  const status = getConnectionStatus(conn);
  card.querySelector('.conn-msg-count').textContent = (conn.messageCount || 0).toLocaleString();
  card.querySelector('.conn-uptime').textContent = formatUptime(conn.uptime || 0);
  const urlEl = card.querySelector('.capture-url');
  if (urlEl) {
    urlEl.textContent = formatDisplayUrl(conn.url);
    urlEl.setAttribute('title', conn.url || '');
  }
  const indicator = card.querySelector('.connection-status');
  if (indicator) {
    indicator.className = `connection-status status-${status}`;
    indicator.setAttribute('aria-label', `Connection ${status}`);
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
  urlInput.blur();
  connectBtn.disabled = true;
  connectBtn.classList.add('connecting');
  connectBtn.innerHTML = '<div class="btn-spinner"></div>';

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
    connectBtn.classList.remove('connecting');
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

async function handleConnectionRefresh(connectionId, url) {
  if (!url) return;
  const card = connectionCards.get(connectionId);
  const refreshBtn = card?.querySelector('.conn-refresh-btn');
  if (refreshBtn) refreshBtn.disabled = true;
  try {
    await api('POST', '/api/disconnect', { connectionId });
    const data = await api('POST', '/api/connect', { url });
    if (!data.ok) alert(data.error || 'Connection refresh failed.');
    await fetchStatus();
  } catch {
    alert('Connection refresh failed.');
    await fetchStatus();
  } finally {
    if (refreshBtn) refreshBtn.disabled = false;
  }
}

async function handleStartWithoutConnecting(e) {
  e.preventDefault();
  openSpoofSelector();
}

function openSpoofSelector() {
  openSelector({
    title: 'Spoof Chat connections:',
    items: SPOOF_OPTIONS,
    pageSize: 6,
    onSelect: async (items) => {
      await api('POST', '/api/start-session');
      for (const item of items) {
        await api('POST', '/api/spoof', { enabled: true, preset: item.value });
      }
      await fetchStatus();
    },
  });
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
  startSpoofLink.addEventListener('click', async (e) => {
    e.preventDefault();
    openSpoofSelector();
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

  // Real-time Electron events
  if (isElectron) {
    window.challachat.on('capture-status', () => fetchStatus());
    window.challachat.on('capture-error', (error) => showError(error));
  }
}
