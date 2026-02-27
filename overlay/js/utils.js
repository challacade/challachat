/**
 * ChallaChat Overlay - Utility Functions
 * Avatar error handling and fallback generation
 */

import { AVATAR_MAX_RETRIES, AVATAR_RETRY_DELAY_MS } from './state.js';

// ================================
// Avatar Error Handling
// ================================

// Generate a solid color fallback avatar as a data URI
export function generateFallbackAvatar(seed = '') {
  const colors = ['#6366f1', '#8b5cf6', '#d946ef', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6'];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const color = colors[Math.abs(hash) % colors.length];
  
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="${color}"/></svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

// Handle avatar image load errors with retry logic
export function handleAvatarError(event) {
  const img = event.target;
  if (!img) return;
  
  const retryCount = parseInt(img.dataset.retryCount || '0', 10);
  const originalSrc = img.dataset.originalSrc || '';
  
  if (retryCount < AVATAR_MAX_RETRIES) {
    // Show fallback immediately while we retry
    img.src = generateFallbackAvatar(originalSrc);
    img.dataset.retryCount = String(retryCount + 1);
    
    // Schedule a retry
    setTimeout(() => {
      if (!img.isConnected) return;
      
      const retryUrl = originalSrc + (originalSrc.includes('?') ? '&' : '?') + '_retry=' + Date.now();
      
      const testImg = new Image();
      testImg.onload = () => {
        if (img.isConnected) {
          img.src = originalSrc;
        }
      };
      testImg.onerror = () => {
        // Still failing, leave the fallback in place
      };
      testImg.src = retryUrl;
    }, AVATAR_RETRY_DELAY_MS);
  } else {
    // Max retries reached, use permanent fallback
    img.src = generateFallbackAvatar(originalSrc);
    img.removeEventListener('error', handleAvatarError);
  }
}
