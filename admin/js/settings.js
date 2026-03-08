/**
 * Settings panel — filter, logger, jam, UI theme/zoom.
 */
import {
  isElectron,
  filterPathInput, filterBrowseBtn, filterToggle, filterMeta,
  loggerToggle, jamToggle, clearMessagesBtn,
  uiThemeSelect, uiZoomSelect,
} from './dom.js';
import { api } from './api.js';

// ─── UI helpers ────────────────────────────────────────────────

function updateFilterUI(f) {
  if (!f) return;
  filterPathInput.value = f.path || '';
  filterToggle.checked = f.active;
  filterMeta.textContent = `(${f.wordCount || 0} words)`;
}

function updateLoggerUI(l) {
  if (!l) return;
  loggerToggle.checked = l.enabled;
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
    const [filter, logger, jam, theme, zoom] = await Promise.all([
      api('GET', '/api/filter'),
      api('GET', '/api/logger'),
      api('GET', '/api/jam'),
      api('GET', '/api/ui-theme'),
      api('GET', '/api/ui-zoom'),
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
  } catch {
    // Server may not be ready yet — ignore
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

  // Settings toggles — data-driven
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
