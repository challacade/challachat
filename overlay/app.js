/**
 * ChallaChat Overlay Application
 * Real-time chat overlay for streaming software with customizable themes and settings
 * 
 * Main entry point - imports and initializes all modules
 */

// ================================
// Module Imports
// ================================

import { state, elements } from './js/state.js';
import { adjustMessageAlignment } from './js/messages.js';
import {
  recomputeAutoScale,
  applyTheme,
  applyPreset,
  loadFromLocal,
  loadFromUrl,
} from './js/settings.js';
import { startSSE } from './js/sse.js';

// ================================
// Application Initialization
// ================================

function start() {
  state.startedAt = Date.now();
  
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
  
  const hasLocalSettings = !!localStorage.getItem('challachat.settings');
  const shouldApplyPreset = hasLocalSettings || hasPresetParam;

  if (!hasLocalSettings && !hasPresetParam && !hasStyleParams) {
    state.preset = 'Dark';
  } else if (!state.preset) {
    state.preset = 'Custom';
  }
  
  // Apply settings
  if (shouldApplyPreset) applyPreset(state.preset);
  applyTheme();
  
  // Start SSE connection
  startSSE();
}

// ================================
// Start Application
// ================================

start();
