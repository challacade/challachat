/**
 * ChallaChat Overlay Application
 * Real-time chat overlay for streaming software with customizable themes and settings
 * 
 * Main entry point - imports and initializes all modules
 */

// ================================
// Module Imports
// ================================

import { state, elements, isDemoSite } from './js/state.js';
import { attachAudioUnlockHandlers, initializeAudio } from './js/audio.js';
import { toggleJam, ensureMusicPlaylistLoaded, fetchMusicSettings, musicPlayer } from './js/music.js';
import { startDemoMode, adjustMessageAlignment } from './js/messages.js';
import {
  setupMouseDetection,
  recomputeAutoScale,
  applyTheme,
  applyPreset,
  loadFromLocal,
  loadFromUrl,
  syncUi,
  bindUi,
  syncMusicSettingsButtonVisibility,
  fetchPollIntervalFromServer,
  fetchCensorFilterStatus,
  fetchLoggerStatus,
  toggleLogger,
  buildCustomPresetDropdown,
  buildSongDisplayDropdown,
  syncCustomPresetDropdown
} from './js/settings.js';
import { startSSE } from './js/sse.js';

// ================================
// Application Initialization
// ================================

function start() {
  state.startedAt = Date.now();
  
  // Setup audio unlock handlers for browsers that block autoplay
  attachAudioUnlockHandlers();

  // Fetch music configuration early so the Music UI can be hidden when not configured.
  const musicSettingsPromise = (async () => {
    try { await fetchMusicSettings(); } catch {}
    try { syncMusicSettingsButtonVisibility(); } catch {}
  })();
  
  // Setup mouse detection for settings buttons
  setupMouseDetection();
  
  // Calculate initial auto-scale
  recomputeAutoScale();
  
  // Handle window resize
  window.addEventListener('resize', () => {
    recomputeAutoScale();
    applyTheme();
    elements.messages.querySelectorAll('.message').forEach(adjustMessageAlignment);
  });
  
  // Load settings from localStorage
  loadFromLocal();
  
  // Apply URL overrides
  loadFromUrl();
  
  // Determine initial preset
  const url = new URL(location.href);
  const hasPresetParam = url.searchParams.has('preset');
  const hasStyleParams = ['scale', 'noavatars', 'nobadges', 'nobubbles', 'gap', 'text', 'bubble', 'bg', 'pagebgcol', 'pagebgop'].some(key => url.searchParams.has(key));
  
  if (!localStorage.getItem('challachat.settings') && !hasPresetParam && !hasStyleParams) {
    state.preset = 'Dark';
  } else if (!state.preset) {
    state.preset = 'Custom';
  }
  
  // Enable demo mode on demo site
  if (isDemoSite()) {
    state.demoMode = true;
  }
  
  // Apply settings
  applyPreset(state.preset);
  applyTheme();
  syncUi();
  bindUi();
  
  // Enable jam if previously enabled
  if (state.music.enableJam) {
    try { toggleJam(true); } catch {}
  }
  
  // Start demo mode if enabled
  if (state.demoMode) {
    startDemoMode();
  }
  
  // Initialize audio
  initializeAudio();
  
  // Fetch settings from server (non-blocking)
  try { fetchPollIntervalFromServer(); } catch {}
  try { fetchCensorFilterStatus(); } catch {}
  // Music settings already requested above; don't eagerly load playlist unless music is configured.
  void musicSettingsPromise.then(() => {
    if (musicPlayer?.isConfigured) {
      try { ensureMusicPlaylistLoaded(); } catch {}
    }
  });
  
  // Restore logger state
  try {
    if (state.logEnabled) {
      toggleLogger(true);
    } else {
      fetchLoggerStatus();
    }
  } catch {}
  
  // Build custom dropdowns
  try {
    buildCustomPresetDropdown();
    syncCustomPresetDropdown();
    buildSongDisplayDropdown();
  } catch {}
  
  // Start SSE connection
  startSSE();
}

// ================================
// Start Application
// ================================

start();
