/**
 * Settings panel - filter, logger, jam, UI theme/zoom.
 */
import {
  isElectron,
  filterPathInput, filterBrowseBtn, filterClearBtn, filterToggle, filterMeta,
  loggerToggle, logFolderPathInput, logFolderBrowseBtn, logFolderClearBtn,
  jamToggle, clearMessagesBtn,
  uiThemeSelect, uiZoomSelect,
} from './dom.js';
import { api } from './api.js';

// ─── UI helpers ────────────────────────────────────────────────

function updateFilterUI(f) {
  if (!f) return;
  filterPathInput.value = f.path || '';
  filterToggle.checked = f.active;
  filterMeta.textContent = `(${f.wordCount || 0} words)`;
  if (filterClearBtn) filterClearBtn.style.display = f.path ? '' : 'none';
}

function updateLoggerUI(l) {
  if (!l) return;
  loggerToggle.checked = l.enabled;
  logFolderPathInput.value = l.logFolderPath || '';
  if (logFolderClearBtn) logFolderClearBtn.style.display = l.logFolderPath ? '' : 'none';
}

function updateJamUI(j) {
  if (!j) return;
  jamToggle.checked = j.enabled;
}

function applyUiTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

function applyUiZoom(pct) {
  const zoom = 1 + (pct / 100);
  document.documentElement.style.setProperty('--ui-zoom', zoom);
}

// ─── Fetch ─────────────────────────────────────────────────────

export async function fetchSettings() {
  try {
    const [filter, logger, jam, theme, zoom, filming] = await Promise.all([
      api('GET', '/api/filter'),
      api('GET', '/api/logger'),
      api('GET', '/api/jam'),
      api('GET', '/api/ui-theme'),
      api('GET', '/api/ui-zoom'),
      api('GET', '/api/filming-mode'),
    ]);
    updateFilterUI(filter);
    updateLoggerUI(logger);
    updateJamUI(jam);
    if (theme && theme.uiTheme) {
      uiThemeSelect.value = theme.uiTheme;
      applyUiTheme(theme.uiTheme);
    }
    if (zoom && typeof zoom.uiZoom === 'number') {
      uiZoomSelect.value = String(zoom.uiZoom);
      applyUiZoom(zoom.uiZoom);
    }
    if (filming && filming.filmingMode) {
      document.body.classList.add('filming-mode');
    } else {
      document.body.classList.remove('filming-mode');
    }
  } catch {
    // Server may not be ready yet - ignore
  }

  // Build info (fire-and-forget, non-blocking)
  fetchBuildInfo();
}

// ─── Build info ────────────────────────────────────────────────

async function fetchBuildInfo() {
  const grid = document.getElementById('buildInfoGrid');
  if (!grid) return;
  try {
    const info = await api('GET', '/api/version');
    if (!info || !info.version) return;
    const items = [
      ['Version', `v${info.version}`],
      ['Platform', `${info.platform}/${info.arch}`],
      ['Node', info.nodeVersion],
    ];
    if (info.electronVersion) items.push(['Electron', `v${info.electronVersion}`]);
    grid.innerHTML = items
      .map(([label, value]) => `<span class="build-info-item"><span class="build-info-label">${label}</span><span class="build-info-value">${value}</span></span>`)
      .join('');
  } catch {
    // Non-critical - leave card empty
  }
}

// ─── Event listeners ───────────────────────────────────────────

export function bindSettingsListeners() {
  // Filter browse (Electron IPC)
  filterBrowseBtn.addEventListener('click', async () => {
    const filePath = isElectron
      ? await window.challachat.invoke('pick-file', {
          title: 'Select censor CSV',
          filters: [{ name: 'CSV Files', extensions: ['csv'] }],
        })
      : null;
    if (!filePath) return;
    try {
      const data = await api('POST', '/api/filter/path', { filterPath: filePath });
      updateFilterUI(data);
    } catch {}
  });

  filterClearBtn.addEventListener('click', async () => {
    try {
      const data = await api('POST', '/api/filter/path', { filterPath: '' });
      updateFilterUI(data);
    } catch {}
  });

  // Logger folder browse (Electron IPC)
  logFolderBrowseBtn.addEventListener('click', async () => {
    const folderPath = isElectron
      ? await window.challachat.invoke('pick-folder', { title: 'Select log folder' })
      : null;
    if (!folderPath) return;
    try {
      const data = await api('POST', '/api/logger/path', { logFolderPath: folderPath });
      updateLoggerUI(data);
    } catch {}
  });

  logFolderClearBtn.addEventListener('click', async () => {
    try {
      const data = await api('POST', '/api/logger/path', { logFolderPath: '' });
      updateLoggerUI(data);
    } catch {}
  });

  // Settings toggles - data-driven
  const SETTINGS_TOGGLES = [
    { toggle: filterToggle,        endpoint: '/api/filter/toggle',  payloadKey: 'active',  updateFn: updateFilterUI },
    { toggle: loggerToggle,        endpoint: '/api/logger/toggle',  payloadKey: 'enabled', updateFn: updateLoggerUI },
    { toggle: jamToggle,           endpoint: '/api/jam/toggle',     payloadKey: 'enabled', updateFn: updateJamUI },
  ];

  for (const { toggle, endpoint, payloadKey, updateFn } of SETTINGS_TOGGLES) {
    toggle.addEventListener('change', async () => {
      try {
        const data = await api('POST', endpoint, { [payloadKey]: toggle.checked });
        await updateFn(data);
      } catch { toggle.checked = !toggle.checked; }
    });
  }

  // UI Theme dropdown
  uiThemeSelect.addEventListener('change', async () => {
    const theme = uiThemeSelect.value;
    applyUiTheme(theme);
    try { await api('POST', '/api/ui-theme', { uiTheme: theme }); } catch {}
  });

  // UI Zoom dropdown
  uiZoomSelect.addEventListener('change', async () => {
    const pct = Number(uiZoomSelect.value);
    applyUiZoom(pct);
    try { await api('POST', '/api/ui-zoom', { uiZoom: pct }); } catch {}
  });

  // Clear all overlay messages
  clearMessagesBtn.addEventListener('click', async () => {
    try { await api('POST', '/api/clear-messages'); } catch {}
  });
}
