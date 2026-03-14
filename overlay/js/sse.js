/**
 * ChallaChat Overlay - Server-Sent Events
 * SSE connection handling for chat events
 */

import { state, showToast } from './state.js';
import { clamp } from '/shared/utils.js';
import { 
  extEventToItem, renderMessage, pushMessageElement, 
  removeMessageById, updateMessageById,
  clearAllMessages
} from './messages.js';
import { applyTheme, applySongDisplay, updateSongDisplayText } from './settings.js';

// ================================
// Smooth Numeric Transitions
// ================================

// Maps SSE data keys → { get/set on state, clamp range }
const NUMERIC_FIELDS = {
  scale:            { get: () => state.scale,              set: v => { state.scale = v; },              min: 0.5,  max: 3    },
  textOpacity:      { get: () => state.theme.textOpacity,  set: v => { state.theme.textOpacity = v; },  min: 0,    max: 1    },
  bubbleOpacity:    { get: () => state.theme.bgOpacity,    set: v => { state.theme.bgOpacity = v; },    min: 0,    max: 1    },
  bgOpacity:        { get: () => state.pageBgOpacity,      set: v => { state.pageBgOpacity = v; },      min: 0,    max: 1    },
  messageGap:       { get: () => state.messageGapRem,      set: v => { state.messageGapRem = v; },      min: 0,    max: 1.5  },
  edgePadding:      { get: () => state.edgePadding,        set: v => { state.edgePadding = v; },        min: 0,    max: 10   },
  textShadow:       { get: () => state.textShadow,         set: v => { state.textShadow = v; },         min: 0,    max: 1    },
  textureIntensity: { get: () => state.textureIntensity,   set: v => { state.textureIntensity = v; },   min: 0,    max: 1    },
  textureScale:     { get: () => state.textureScale,       set: v => { state.textureScale = v; },       min: 0.25, max: 4    },
  textureGap:       { get: () => state.textureGap,         set: v => { state.textureGap = v; },         min: 0.5,  max: 5    },
};

let lerpSpeed = 8;       // multiplier — higher = faster convergence
const EPSILON = 0.0005;  // snap to target when this close

const targets = new Map();   // key → target value
let animating = false;

function setTarget(key, rawValue) {
  const field = NUMERIC_FIELDS[key];
  if (!field) return;
  const value = clamp(rawValue, field.min, field.max);
  targets.set(key, value);
  if (!animating) {
    animating = true;
    requestAnimationFrame(lerpTick);
  }
}

let lastTime = 0;
function lerpTick(now) {
  const dt = lastTime ? Math.min((now - lastTime) / 1000, 0.05) : 0.016;
  lastTime = now;

  let stillActive = false;
  for (const [key, target] of targets) {
    const field = NUMERIC_FIELDS[key];
    const current = field.get();
    const diff = target - current;
    if (Math.abs(diff) < EPSILON) {
      field.set(target);
      targets.delete(key);
    } else {
      // Linear interpolation toward target, frame-rate independent
      const step = diff * Math.min(lerpSpeed * dt, 1);
      field.set(current + step);
      stillActive = true;
    }
  }

  applyTheme();

  if (stillActive || targets.size > 0) {
    requestAnimationFrame(lerpTick);
  } else {
    animating = false;
    lastTime = 0;
  }
}

// ================================
// SSE Connection
// ================================

export function startSSE() {
  showToast('Connecting…');
  const eventSource = new EventSource('/api/stream');

  eventSource.addEventListener('open', () => {
  });

  eventSource.addEventListener('chat', (event) => {
    try {
      const data = JSON.parse(event.data);
      const events = data.events || [];
      
      events.forEach((chatEvent) => {
        if (chatEvent.type === 'delete' && chatEvent.id) {
          removeMessageById(chatEvent.id);
          return;
        }
        if (chatEvent.type === 'update' && chatEvent.id) {
          updateMessageById(chatEvent);
          return;
        }
        
        const item = extEventToItem(chatEvent);
        const messageNode = renderMessage(item);
        
        if (messageNode) {
          pushMessageElement(messageNode, item.snippet.publishedAt);
        }
      });
    } catch {}
  });

  // Appearance updates from admin UI
  eventSource.addEventListener('appearance', (event) => {
    try {
      const data = JSON.parse(event.data || '{}');
      let needsImmediateApply = false;

      // Transition speed (applied immediately, not animated)
      if (typeof data.transitionSpeed === 'number') {
        lerpSpeed = clamp(data.transitionSpeed, 1, 100);
      }

      // Numeric fields — animate smoothly toward target
      for (const key of Object.keys(NUMERIC_FIELDS)) {
        if (typeof data[key] === 'number') {
          setTarget(key, data[key]);
        }
      }

      // Non-numeric fields — apply immediately
      if (typeof data.textColor === 'string') {
        state.theme.text = data.textColor;
        needsImmediateApply = true;
      }
      if (typeof data.bubbleColor === 'string') {
        state.theme.bubbleColor = data.bubbleColor;
        needsImmediateApply = true;
      }
      if (typeof data.bgColor === 'string') {
        state.pageBgColor = data.bgColor;
        needsImmediateApply = true;
      }
      if (typeof data.showBubbles === 'boolean') {
        state.showBubbles = data.showBubbles;
        needsImmediateApply = true;
      }
      if (typeof data.showAvatars === 'boolean') {
        state.showAvatars = data.showAvatars;
        needsImmediateApply = true;
      }
      if (typeof data.showBadges === 'boolean') {
        state.showBadges = data.showBadges;
        needsImmediateApply = true;
      }
      if (typeof data.preset === 'string') {
        state.preset = data.preset;
      }
      if (typeof data.texture === 'string') {
        state.texture = data.texture;
        needsImmediateApply = true;
      }
      if (typeof data.textureColor === 'string') {
        state.textureColor = data.textureColor;
        needsImmediateApply = true;
      }
      if (typeof data.overlayFont === 'string') {
        state.overlayFont = data.overlayFont;
        needsImmediateApply = true;
      }
      if (typeof data.chatDirection === 'string') {
        state.chatDirection = data.chatDirection;
        needsImmediateApply = true;
      }

      // If only non-numeric fields changed and no animation is running, apply now
      if (needsImmediateApply && !animating) {
        applyTheme();
      }
    } catch {
      // ignore
    }
  });

  // Music display settings from admin UI
  eventSource.addEventListener('music-settings', (event) => {
    try {
      const data = JSON.parse(event.data || '{}');
      if (typeof data.songDisplay === 'string') {
        state.songDisplay.position = data.songDisplay;
      }
      if (typeof data.songScrollSpeed === 'number') {
        state.songDisplay.scrollSpeed = data.songScrollSpeed;
      }
      if (typeof data.songTextSize === 'number') {
        state.songDisplay.textSize = data.songTextSize;
      }
      applySongDisplay();
    } catch {}
  });

  // Now-playing song title from admin music player
  eventSource.addEventListener('now-playing', (event) => {
    try {
      const data = JSON.parse(event.data || '{}');
      if (typeof data.songId === 'string') {
        state.songDisplay.songId = data.songId;
      }
      updateSongDisplayText();
    } catch {}
  });

  eventSource.addEventListener('clear-messages', () => {
    clearAllMessages();
  });

  eventSource.addEventListener('end', () => {
    showToast('Session ended');
  });
  
  eventSource.addEventListener('error', () => {
    showToast('Connection error');
  });
}
