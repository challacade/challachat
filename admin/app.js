/**
 * ChallaChat Admin Panel
 *
 * When running inside Electron the panel uses IPC (window.challachat.invoke /
 * window.challachat.on) for zero-latency communication with the backend.
 * Otherwise it falls back to REST API polling so the admin page also works
 * when opened in a regular browser (terminal mode).
 *
 * Main entry point — imports and initializes all modules.
 */

import { isElectron } from './js/dom.js';
import { initAdminAudio, startAdminSSE } from './js/audio.js';
import { initMusic, bindMusicListeners } from './js/music.js';
import { fetchAppearance, bindAppearanceListeners } from './js/appearance.js';
import { fetchSounds, bindSoundListeners } from './js/sounds.js';
import { fetchStatus, fetchSettings, bindConnectionListeners } from './js/connections.js';

// ─── Bind all event listeners ──────────────────────────────────

bindConnectionListeners();
bindMusicListeners();
bindAppearanceListeners();
bindSoundListeners();

// ─── Init ──────────────────────────────────────────────────────

fetchStatus();
fetchSettings();
fetchSounds();
fetchAppearance();
initAdminAudio().catch(() => {});
initMusic().catch(() => {});
startAdminSSE();
setInterval(() => { fetchStatus(); fetchSettings(); }, isElectron ? 5000 : 2000);
