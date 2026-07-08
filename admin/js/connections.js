/**
 * Connection lifecycle - connect/disconnect, dynamic cards, status polling.
 */
import {
  isElectron,
  logoImg, connectError,
  connectionsContainer, overlayCard, overlayUrl, copyBtn,
  welcomeView,
  addConnectionCard, addUrlInput, addConnectBtn, closeServerLink, startSpoofLink, connectionHistoryLink,
} from './dom.js';
import { api } from './api.js';
import { switchPage } from './navigation.js';

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

function getYouTubeChannelLabel(url) {
  try {
    const parsed = new URL(url);
    const firstPart = parsed.pathname.split('/').filter(Boolean)[0];
    return firstPart ? decodeURIComponent(firstPart) : '';
  } catch {
    const match = String(url || '').match(/youtube\.com\/([^/?#]+)/i);
    return match?.[1] ? decodeURIComponent(match[1]) : '';
  }
}

function getConnectionDisplayName(conn) {
  if (conn.platform === 'spoof') return conn.displayName || conn.url || 'Spoof Chat';
  if (conn.platform !== 'youtube') return formatDisplayUrl(conn.url);

  const displayName = String(conn.displayName || '').trim();
  if (displayName) return displayName;

  if (conn.sourceKind === 'channel-live') {
    const channelLabel = getYouTubeChannelLabel(conn.channelUrl || conn.originalUrl || conn.url);
    if (channelLabel) return channelLabel;
  }

  return formatDisplayUrl(conn.resolvedUrl || conn.url);
}

function getConnectionDetailsTooltip(conn) {
  return String(conn.streamTitle || '').trim();
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function getConnectionStatus(conn) {
  const raw = String(conn.status || conn.captureStatus || (conn.active === false ? 'inactive' : 'active')).toLowerCase();
  if (['connecting', 'starting', 'pending'].includes(raw)) return 'connecting';
  if (['problem', 'warning', 'degraded', 'reconnecting'].includes(raw)) return 'warning';
  if (['error', 'failed'].includes(raw)) return 'failed';
  if (['inactive', 'stopped', 'disconnected'].includes(raw)) return 'inactive';
  return 'active';
}

function getConnectionStatusLabel(status) {
  if (status === 'connecting') return 'Connecting';
  if (status === 'failed') return 'Failed';
  if (status === 'warning') return 'Warning';
  if (status === 'inactive') return 'Inactive';
  return 'Active';
}

function renderConnectionStats(conn, status) {
  if (status === 'connecting') {
    return '<div class="capture-inline-status"><span class="capture-inline-spinner" aria-hidden="true"></span><strong>Connecting</strong></div>';
  }
  if (status === 'failed') {
    const reason = escapeHtml(conn.error || 'Connection failed.');
    return `<div class="capture-inline-status capture-inline-status-failed has-tooltip" data-tooltip="${reason}"><strong>Failed</strong></div>`;
  }
  if (status === 'warning') {
    const reason = escapeHtml(conn.statusText || 'Warning');
    return `<div class="capture-inline-status capture-inline-status-warning has-tooltip" data-tooltip="${reason}"><strong>Warning</strong></div>`;
  }
  return `
        <div class="capture-inline-stat"><strong class="conn-msg-count">${(conn.messageCount || 0).toLocaleString()}</strong><span>Messages</span></div>
        <div class="capture-inline-stat"><strong class="conn-uptime">${formatUptime(conn.uptime || 0)}</strong><span>Uptime</span></div>`;
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

function formatHistoryLabel(item) {
  if (item.type === 'spoof') return item.label || 'Spoof Chat';
  return formatDisplayUrl(item.url || item.label || '');
}

function getHistoryIcon(item) {
  if (item.type === 'spoof') return { emoji: '🤖' };
  const icon = PLATFORM_ICONS[item.platform];
  return icon ? { src: icon, alt: item.platform || '' } : null;
}

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
        ${item.icon ? `<span class="selector-option-icon">${item.icon.src ? `<img src="${item.icon.src}" alt="${item.icon.alt || ''}" />` : item.icon.emoji || ''}</span>` : ''}
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
    close();
    try { await onSelect(selectedItems); }
    catch { showError('Failed to start selected connections.'); }
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

function createConnectionCard(conn) {
  const card = document.createElement('section');
  card.className = 'card capture-card';
  card.dataset.connId = conn.id;
  const status = getConnectionStatus(conn);
  card.dataset.status = status;

  const iconSrc = PLATFORM_ICONS[conn.platform] || '';
  const isSpoof = conn.platform === 'spoof';
  const displayName = getConnectionDisplayName(conn);
  const detailsTooltip = getConnectionDetailsTooltip(conn);
  const identityTooltipClass = detailsTooltip ? ' has-tooltip' : '';
  const identityTooltipAttr = detailsTooltip ? ` data-tooltip="${escapeHtml(detailsTooltip)}"` : '';
  const statusLabel = getConnectionStatusLabel(status);
  const refreshLabel = status === 'failed' ? 'Retry' : 'Refresh';
  card.innerHTML = `
    <div class="capture-header">
      <div class="connection-status status-${status} has-tooltip" aria-label="Connection ${escapeHtml(statusLabel)}" data-tooltip="${escapeHtml(statusLabel)}">
        <span class="connection-status-dot"></span>
      </div>
      <span class="capture-identity${identityTooltipClass}"${identityTooltipAttr}>
        ${isSpoof
          ? '<span class="capture-platform-emoji" aria-label="Spoof chat">🤖</span>'
          : `<img class="capture-platform-icon" src="${iconSrc}" alt="${escapeHtml(conn.platform || '')}" style="${iconSrc ? '' : 'display:none'}" />`}
        <span class="capture-url">${escapeHtml(displayName)}</span>
      </span>
      <div class="capture-inline-stats" aria-label="Connection stats">
        ${renderConnectionStats(conn, status)}
      </div>
      <button class="btn small primary conn-refresh-btn" ${status === 'connecting' ? 'disabled' : ''}>${refreshLabel}</button>
      <button class="btn small danger conn-disconnect-btn">Disconnect</button>
    </div>`;

  card.querySelector('.conn-refresh-btn').addEventListener('click', () => handleConnectionRefresh(conn));
  card.querySelector('.conn-disconnect-btn').addEventListener('click', () => handleConnectionDisconnect(conn.id));

  connectionCards.set(conn.id, card);
  connectionsContainer.appendChild(card);
  return card;
}

function updateConnectionCard(card, conn) {
  const status = getConnectionStatus(conn);
  const previousStatus = card.dataset.status || '';
  const stats = card.querySelector('.capture-inline-stats');
  if (stats) {
    if (status !== previousStatus) {
      stats.innerHTML = renderConnectionStats(conn, status);
    } else if (status === 'active') {
      const msgCount = stats.querySelector('.conn-msg-count');
      const uptime = stats.querySelector('.conn-uptime');
      if (msgCount) msgCount.textContent = (conn.messageCount || 0).toLocaleString();
      if (uptime) uptime.textContent = formatUptime(conn.uptime || 0);
    }
  }
  card.dataset.status = status;
  const urlEl = card.querySelector('.capture-url');
  if (urlEl) {
    urlEl.textContent = getConnectionDisplayName(conn);
    urlEl.removeAttribute('title');
  }
  const identity = card.querySelector('.capture-identity');
  if (identity) {
    const detailsTooltip = getConnectionDetailsTooltip(conn);
    identity.classList.toggle('has-tooltip', !!detailsTooltip);
    if (detailsTooltip) identity.setAttribute('data-tooltip', detailsTooltip);
    else identity.removeAttribute('data-tooltip');
    identity.removeAttribute('title');
    identity.removeAttribute('tabindex');
  }
  const indicator = card.querySelector('.connection-status');
  if (indicator) {
    const statusLabel = getConnectionStatusLabel(status);
    indicator.className = `connection-status status-${status} has-tooltip`;
    indicator.setAttribute('aria-label', `Connection ${statusLabel}`);
    indicator.setAttribute('data-tooltip', statusLabel);
    indicator.removeAttribute('title');
    indicator.removeAttribute('tabindex');
  }
  const refreshBtn = card.querySelector('.conn-refresh-btn');
  if (refreshBtn) {
    refreshBtn.disabled = status === 'connecting';
    refreshBtn.textContent = status === 'failed' ? 'Retry' : 'Refresh';
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
  overlayCard.classList.toggle('hidden', !isActive);

  const connections = status.connections || [];
  const activeIds = new Set(connections.map(c => c.id));

  for (const [id] of connectionCards) {
    if (!activeIds.has(id)) removeConnectionCard(id);
  }

  for (const conn of connections) {
    const existing = connectionCards.get(conn.id);
    if (existing) {
      updateConnectionCard(existing, conn);
    } else {
      createConnectionCard(conn);
    }
  }

  const realConnections = connections.filter(c => c.platform !== 'spoof');
  const connectionLimitReached = realConnections.length >= MAX_CONNECTIONS;
  addConnectionCard.classList.remove('hidden');
  addUrlInput.closest('.input-row')?.classList.toggle('hidden', connectionLimitReached);
  connectionsContainer.classList.toggle('hidden', connections.length === 0);

  if (realConnections.length === 0) {
    addUrlInput.placeholder = 'Paste a YouTube, Twitch, or Kick URL';
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

async function handleAddConnect() {
  const url = addUrlInput.value.trim();
  if (!url) { showError('Please enter a livestream URL.'); return; }

  hideError();
  addUrlInput.blur();
  switchPage('home');
  addConnectBtn.disabled = true;
  addConnectBtn.classList.add('connecting');
  addConnectBtn.innerHTML = '<div class="btn-spinner"></div>';
  try {
    const data = await api('POST', '/api/connect', { url });
    if (data.ok) {
      hideError();
      addUrlInput.value = '';
    } else {
      showError(data.error || 'Connection failed.');
    }
    await fetchStatus();
  } catch {
    showError('Failed to connect. Is the server running?');
  } finally {
    addConnectBtn.disabled = false;
    addConnectBtn.classList.remove('connecting');
    addConnectBtn.textContent = 'Connect';
  }
}

async function handleConnectionDisconnect(connectionId) {
  try {
    await api('POST', '/api/disconnect', { connectionId });
    await fetchStatus();
  } catch { /* ignore */ }
}

async function handleConnectionRefresh(conn) {
  if (!conn) return;
  const card = connectionCards.get(conn.id);
  const refreshBtn = card?.querySelector('.conn-refresh-btn');
  if (refreshBtn) refreshBtn.disabled = true;
  try {
    await api('POST', '/api/disconnect', { connectionId: conn.id });
    const data = conn.platform === 'spoof'
      ? await api('POST', '/api/spoof', { enabled: true, preset: conn.spoofPreset })
      : await api('POST', '/api/connect', { url: conn.url });
    if (!data.ok) alert(data.error || 'Connection refresh failed.');
    await fetchStatus();
  } catch {
    alert('Connection refresh failed.');
    await fetchStatus();
  } finally {
    if (refreshBtn) refreshBtn.disabled = false;
  }
}

function openSpoofSelector() {
  openSelector({
    title: 'Spoof Chat connections:',
    items: SPOOF_OPTIONS,
    pageSize: 6,
    onSelect: async (items) => {
      switchPage('home');
      await api('POST', '/api/start-session');
      await fetchStatus();
      for (const item of items) {
        const data = await api('POST', '/api/spoof', { enabled: true, preset: item.value });
        if (!data.ok) showError(data.error || 'Failed to start spoof connection.');
        await fetchStatus();
      }
    },
  });
}

async function openConnectionHistorySelector() {
  try {
    const data = await api('GET', '/api/connection-history');
    const history = Array.isArray(data?.history) ? data.history : [];
    if (history.length === 0) {
      alert('No connection history yet.');
      return;
    }
    openSelector({
      title: 'Connection history:',
      items: history.map(item => ({ ...item, value: item.key, label: formatHistoryLabel(item), icon: getHistoryIcon(item) })),
      pageSize: 8,
      onSelect: async (items) => {
        switchPage('home');
        await api('POST', '/api/start-session');
        await fetchStatus();
        for (const item of items) {
          if (item.type === 'spoof') {
            const data = await api('POST', '/api/spoof', { enabled: true, preset: item.preset || 'welcome' });
            if (!data.ok) showError(data.error || 'Failed to start spoof connection.');
          } else if (item.url) {
            const data = await api('POST', '/api/connect', { url: item.url });
            if (!data.ok) showError(data.error || 'Connection failed.');
          }
          await fetchStatus();
        }
      },
    });
  } catch {
    alert('Failed to load connection history.');
  }
}

// ─── Event listeners ───────────────────────────────────────────

export function bindConnectionListeners() {
  // Connect / disconnect
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
  connectionHistoryLink.addEventListener('click', async (e) => {
    e.preventDefault();
    await openConnectionHistorySelector();
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
