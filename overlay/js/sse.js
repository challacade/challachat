/**
 * ChallaChat Overlay - Server-Sent Events
 * SSE connection handling for chat events
 */

import { state, isDemoSite, showToast } from './state.js';
import { clamp } from '/shared/utils.js';
import { 
  extEventToItem, renderMessage, pushMessageElement, 
  removeMessageById, updateMessageById,
  startDummyChatters, stopDummyChatters
} from './messages.js';
import { applyTheme, applySongDisplay, updateSongDisplayText } from './settings.js';

// ================================
// SSE Connection
// ================================

export function startSSE() {
  if (isDemoSite()) return;
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
      if (typeof data.scale === 'number') {
        state.scale = clamp(data.scale, 0.5, 3);
      }
      if (typeof data.textOpacity === 'number') {
        state.theme.textOpacity = clamp(data.textOpacity, 0, 1);
      }
      if (typeof data.bubbleOpacity === 'number') {
        state.theme.bgOpacity = clamp(data.bubbleOpacity, 0, 1);
      }
      if (typeof data.bgOpacity === 'number') {
        state.pageBgOpacity = clamp(data.bgOpacity, 0, 1);
      }
      if (typeof data.messageGap === 'number') {
        state.messageGapRem = clamp(data.messageGap, 0, 1.5);
      }
      if (typeof data.edgePadding === 'number') {
        state.edgePadding = clamp(data.edgePadding, 0, 5);
      }
      if (typeof data.textColor === 'string') {
        state.theme.text = data.textColor;
      }
      if (typeof data.bubbleColor === 'string') {
        state.theme.bubbleColor = data.bubbleColor;
      }
      if (typeof data.bgColor === 'string') {
        state.pageBgColor = data.bgColor;
      }
      if (typeof data.showBubbles === 'boolean') {
        state.showBubbles = data.showBubbles;
      }
      if (typeof data.showAvatars === 'boolean') {
        state.showAvatars = data.showAvatars;
      }
      if (typeof data.showBadges === 'boolean') {
        state.showBadges = data.showBadges;
      }
      if (typeof data.preset === 'string') {
        state.preset = data.preset;
      }
      if (typeof data.texture === 'string') {
        state.texture = data.texture;
      }
      if (typeof data.textureIntensity === 'number') {
        state.textureIntensity = clamp(data.textureIntensity, 0, 1);
      }
      if (typeof data.textureScale === 'number') {
        state.textureScale = clamp(data.textureScale, 0.25, 4);
      }
      if (typeof data.textureColor === 'string') {
        state.textureColor = data.textureColor;
      }
      if (typeof data.overlayFont === 'string') {
        state.overlayFont = data.overlayFont;
      }
      if (typeof data.chatDirection === 'string') {
        state.chatDirection = data.chatDirection;
      }
      applyTheme();
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

  // Dummy chatters toggle from admin UI
  eventSource.addEventListener('dummy-chatters', (event) => {
    try {
      const data = JSON.parse(event.data || '{}');
      if (typeof data.enabled === 'boolean') {
        state.dummyChatters = data.enabled;
        if (data.enabled) {
          startDummyChatters();
        } else {
          stopDummyChatters();
        }
      }
    } catch {}
  });

  eventSource.addEventListener('end', () => {
    showToast('Session ended');
  });
  
  eventSource.addEventListener('error', () => {
    showToast('Connection error');
  });
}
