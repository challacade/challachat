/**
 * ChallaChat Overlay - Utility Functions
 * Color helpers, validation, and general utility functions
 */

// ================================
// Number Utilities
// ================================

export function clamp01(n) {
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, Math.min(1, n));
}

// ================================
// Color Helper Functions
// ================================

export function isValidHexColor(hex) {
  if (!hex || typeof hex !== 'string') return false;
  const cleanHex = hex.replace('#', '');
  return /^[0-9A-Fa-f]{3}$|^[0-9A-Fa-f]{6}$/.test(cleanHex);
}

export function normalizeHexColor(hex) {
  if (!hex || typeof hex !== 'string') return '#000000';
  
  let cleanHex = hex.replace('#', '');
  
  // Convert 3-char hex to 6-char
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map(c => c + c).join('');
  }
  
  // Pad to 6 characters if needed
  cleanHex = cleanHex.padEnd(6, '0');
  
  return '#' + cleanHex.toUpperCase();
}

export function updateColorPreview(inputElement, previewElement) {
  if (!inputElement || !previewElement) return;
  
  const hex = inputElement.value;
  if (isValidHexColor(hex)) {
    const normalizedHex = normalizeHexColor(hex);
    previewElement.style.backgroundColor = normalizedHex;
    inputElement.style.borderColor = 'rgba(255,255,255,0.15)';
  } else {
    previewElement.style.backgroundColor = 'transparent';
    inputElement.style.borderColor = 'rgba(255,100,100,0.5)';
  }
}

export function setupColorInput(inputElement, previewElement) {
  if (!inputElement || !previewElement) return;
  
  // Initialize preview
  updateColorPreview(inputElement, previewElement);
  
  // Update preview and force uppercase on input
  inputElement.addEventListener('input', () => {
    const cursorPos = inputElement.selectionStart;
    inputElement.value = inputElement.value.toUpperCase();
    inputElement.setSelectionRange(cursorPos, cursorPos);
    
    updateColorPreview(inputElement, previewElement);
  });
  
  // Normalize and validate on blur
  inputElement.addEventListener('blur', () => {
    const hex = inputElement.value;
    if (isValidHexColor(hex)) {
      inputElement.value = normalizeHexColor(hex);
      updateColorPreview(inputElement, previewElement);
    }
  });
}

// ================================
// Avatar Error Handling
// ================================

import { AVATAR_MAX_RETRIES, AVATAR_RETRY_DELAY_MS } from './state.js';

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

// ================================
// HTTP Utilities
// ================================

export async function postJson(url, body) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

// ================================
// Array Utilities
// ================================

export function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}
