/**
 * ChallaChat Overlay - Server-Sent Events
 * SSE connection handling for chat events and music control
 */

import { state, isDemoSite, showToast } from './state.js';
import { audio, playSound } from './audio.js';
import { musicTogglePlayPause, musicPrev, musicNext, musicShuffle } from './music.js';
import { 
  extEventToItem, renderMessage, pushMessageElement, 
  removeMessageById, updateMessageById, shouldPlaySound 
} from './messages.js';
import { applyTheme } from './settings.js';

// ================================
// SSE Connection
// ================================

export function startSSE() {
  if (isDemoSite()) return;
  showToast('Connecting…');
  const eventSource = new EventSource('/api/stream');

  eventSource.addEventListener('open', () => {
    try {
      if (audio.ctx && audio.ctx.state === 'suspended') {
        audio.ctx.resume().catch(() => {});
      }
    } catch {}
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
          const shouldPlay = shouldPlaySound(item.snippet.publishedAt);
          
          if (shouldPlay) {
            if (item.snippet.type === 'newSponsorEvent' || item.snippet.type === 'memberMilestoneChatEvent') {
              if ((state.sounds.member.volume || 0) > 0) {
                playSound(audio.member, state.sounds.member.volume);
              }
            } else if (item.snippet.type === 'superChatEvent') {
              if ((state.sounds.donation.volume || 0) > 0) {
                playSound(audio.donation, state.sounds.donation.volume);
              }
            } else {
              if ((state.sounds.message.volume || 0) > 0) {
                playSound(audio.message, state.sounds.message.volume);
              }
            }
            
            try {
              if (audio.ctx && audio.ctx.state === 'suspended') {
                showToast('Click overlay to enable sound');
              }
            } catch {}
          }
        }
      });
    } catch {}
  });

  // Remote music control (from terminal hotkeys)
  eventSource.addEventListener('music-control', (event) => {
    try {
      const data = JSON.parse(event.data || '{}');
      const action = data?.action;
      if (action === 'playPause') {
        void musicTogglePlayPause();
        return;
      }
      if (action === 'prev') {
        void musicPrev();
        return;
      }
      if (action === 'next') {
        void musicNext();
        return;
      }
      if (action === 'shuffle') {
        void musicShuffle();
        return;
      }
    } catch {
      // ignore
    }
  });

  // Appearance updates from admin UI
  eventSource.addEventListener('appearance', (event) => {
    try {
      const data = JSON.parse(event.data || '{}');
      if (typeof data.scale === 'number') {
        state.scale = Math.max(0.5, Math.min(3, data.scale));
      }
      if (typeof data.textOpacity === 'number') {
        state.theme.textOpacity = Math.max(0, Math.min(1, data.textOpacity));
      }
      if (typeof data.bubbleOpacity === 'number') {
        state.theme.bgOpacity = Math.max(0, Math.min(1, data.bubbleOpacity));
      }
      if (typeof data.bgOpacity === 'number') {
        state.pageBgOpacity = Math.max(0, Math.min(1, data.bgOpacity));
      }
      if (typeof data.messageGap === 'number') {
        state.messageGapRem = Math.max(0, Math.min(1.5, data.messageGap));
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
      applyTheme();
    } catch {
      // ignore
    }
  });

  eventSource.addEventListener('end', () => {
    showToast('Session ended');
  });
  
  eventSource.addEventListener('error', () => {
    showToast('Connection error');
  });
}
