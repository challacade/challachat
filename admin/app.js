/**
 * ChallaChat Admin Panel
 * Simple control panel for managing the ChallaChat server.
 * Communicates with the Express backend via REST API.
 */

// --- Elements ---
const serverDot = document.getElementById('serverDot');
const serverStatus = document.getElementById('serverStatus');
const urlInput = document.getElementById('urlInput');
const connectBtn = document.getElementById('connectBtn');
const connectError = document.getElementById('connectError');
const connectSection = document.getElementById('connectSection');
const captureSection = document.getElementById('captureSection');
const platformBadge = document.getElementById('platformBadge');
const captureUrl = document.getElementById('captureUrl');
const messageCount = document.getElementById('messageCount');
const uptime = document.getElementById('uptime');
const disconnectBtn = document.getElementById('disconnectBtn');
const overlayUrl = document.getElementById('overlayUrl');
const copyBtn = document.getElementById('copyBtn');

let pollTimer = null;
let connecting = false;

// --- Helpers ---

function formatUptime(ms) {
  if (!ms || ms <= 0) return '0s';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const remainS = s % 60;
  if (m < 60) return `${m}m ${remainS}s`;
  const h = Math.floor(m / 60);
  const remainM = m % 60;
  return `${h}h ${remainM}m`;
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
  serverStatus.textContent = active ? 'Server running' : 'Starting...';
}

// --- Status Polling ---

async function fetchStatus() {
  try {
    const res = await fetch('/api/status');
    if (!res.ok) return;
    const data = await res.json();
    updateUI(data);
  } catch {
    // Server not ready yet
    setServerActive(false);
  }
}

function updateUI(status) {
  setServerActive(true);

  // Update overlay URL
  if (status.overlayUrl) {
    overlayUrl.textContent = status.overlayUrl;
  }

  if (status.isRunning) {
    // Show capture status, hide connect form
    connectSection.classList.add('hidden');
    captureSection.classList.remove('hidden');

    // Platform badge
    const p = status.platform || 'unknown';
    platformBadge.textContent = p;
    platformBadge.className = 'platform-badge ' + p;

    // URL
    captureUrl.textContent = status.url || '';

    // Stats
    messageCount.textContent = (status.messageCount || 0).toLocaleString();
    uptime.textContent = formatUptime(status.uptime || 0);
  } else {
    // Show connect form, hide capture status
    if (!connecting) {
      connectSection.classList.remove('hidden');
    }
    captureSection.classList.add('hidden');
  }
}

// --- Connect / Disconnect ---

async function handleConnect() {
  const url = urlInput.value.trim();
  if (!url) {
    showError('Please enter a livestream URL.');
    return;
  }

  hideError();
  connecting = true;
  connectBtn.disabled = true;
  connectBtn.textContent = 'Connecting...';

  try {
    const res = await fetch('/api/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();

    if (!data.ok) {
      showError(data.error || 'Connection failed.');
    } else {
      hideError();
      urlInput.value = '';
    }

    // Refresh status immediately
    await fetchStatus();
  } catch (e) {
    showError('Failed to connect. Is the server running?');
  } finally {
    connecting = false;
    connectBtn.disabled = false;
    connectBtn.textContent = 'Connect';
  }
}

async function handleDisconnect() {
  disconnectBtn.disabled = true;
  disconnectBtn.textContent = 'Disconnecting...';

  try {
    await fetch('/api/disconnect', { method: 'POST' });
    await fetchStatus();
  } catch {
    // ignore
  } finally {
    disconnectBtn.disabled = false;
    disconnectBtn.textContent = 'Disconnect';
  }
}

function handleCopy() {
  const text = overlayUrl.textContent;
  navigator.clipboard.writeText(text).then(() => {
    const original = copyBtn.textContent;
    copyBtn.textContent = '✓';
    setTimeout(() => { copyBtn.textContent = original; }, 1500);
  }).catch(() => {});
}

// --- Event Listeners ---

connectBtn.addEventListener('click', handleConnect);
disconnectBtn.addEventListener('click', handleDisconnect);
copyBtn.addEventListener('click', handleCopy);

urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleConnect();
});

// --- Init ---

fetchStatus();
pollTimer = setInterval(fetchStatus, 2000);
