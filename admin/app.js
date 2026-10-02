/**
 * ChallaChat Admin Panel
 *
 * When running inside Electron the panel uses IPC (window.challachat.invoke /
 * window.challachat.on) for zero-latency communication with the backend.
 * Otherwise it falls back to REST API polling so the admin page also works
 * when opened in a regular browser (terminal mode).
 *
 * Main entry point - imports and initializes all modules.
 */

import { isElectron } from './js/dom.js';
import { initAdminAudio, startAdminSSE } from './js/audio.js';
import { initMusic, bindMusicListeners } from './js/music.js';
import { fetchAppearance, bindAppearanceListeners } from './js/appearance.js';
import { fetchSounds, bindSoundListeners } from './js/sounds.js';
import { fetchStatus, updateUI, bindConnectionListeners } from './js/connections.js';
import { fetchSettings, fetchBuildInfo, bindSettingsListeners } from './js/settings.js';
import { bindNavigationListeners } from './js/navigation.js';

// ─── Bind all event listeners ──────────────────────────────────

bindNavigationListeners();
bindConnectionListeners();
bindSettingsListeners();
bindMusicListeners();
bindAppearanceListeners();
bindSoundListeners();

// ─── Init ──────────────────────────────────────────────────────

fetchStatus();
fetchSettings();
fetchBuildInfo();
fetchSounds();
fetchAppearance();
initAdminAudio().catch(() => {});
initMusic().catch(() => {});
const adminEvents = startAdminSSE();

// Connection changes are pushed instantly; the timer only refreshes live stats (message counts, uptime).
adminEvents.addEventListener('status', (event) => {
  try { updateUI(JSON.parse(event.data)); } catch {}
});
setInterval(fetchStatus, isElectron ? 5000 : 2000);

// Settings only change from this panel; re-read on focus to pick up hand edits to settings.json.
window.addEventListener('focus', () => fetchSettings());

// Electron capture events also refresh settings
if (isElectron) {
  window.challachat.on('capture-status', () => fetchSettings());
}
